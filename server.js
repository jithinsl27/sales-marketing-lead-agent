// Drops Lead Desk server: one small Node process for Cloud Run (no framework).
import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { createAI } from "./ai.js";
import { DEFAULT_CFG, STAGES, CHANNELS, LANGS, EX_CHANNELS, qualifyPrompt, writePrompt, extractMessagePrompt } from "./prompts.js";
import { runExtract, INTENTS } from "./extract.js";
import { notifySignup, notifyChannels } from "./notify.js";

const PORT = Number(process.env.PORT || 8080);
const PROD = process.env.NODE_ENV === "production";
// Empty or "*" = any email address may sign up. Otherwise a comma-separated list of domains.
const DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "*").split(",").map(s => s.trim().toLowerCase()).filter(d => d && d !== "*");
// "true" = new accounts wait for an admin; anything else = they can use the app straight away.
const REQUIRE_APPROVAL = String(process.env.REQUIRE_APPROVAL || "false").toLowerCase() === "true";
const ADMINS = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const SECRET = process.env.SESSION_SECRET || (PROD ? "" : "local-dev-secret");
if (!SECRET || SECRET.length < 32 && PROD) { console.error("SESSION_SECRET must be set (32+ chars)."); process.exit(1); }
const SESSION_DAYS = 14;
const DIR = path.dirname(fileURLToPath(import.meta.url));

const store = await createStore();
const ai = await createAI();
// Cloud Scheduler calls /api/extract/run with a Google-signed OIDC token for this service account.
const EXTRACT_INVOKER = (process.env.EXTRACT_INVOKER || "").toLowerCase();
const EXTRACT_AUDIENCE = process.env.EXTRACT_AUDIENCE || "drops-extract";
let oidcVerifier = null;
let googleClient = null;
{ const { OAuth2Client } = await import("google-auth-library"); oidcVerifier = new OAuth2Client(); if (GOOGLE_CLIENT_ID) googleClient = new OAuth2Client(GOOGLE_CLIENT_ID); }

/* ---------- static files (cached in memory) ---------- */
const STATIC = {};
for (const [url, file, type] of [["/", "index.html", "text/html; charset=utf-8"], ["/app.js", "app.js", "text/javascript; charset=utf-8"],
  ["/app.css", "app.css", "text/css; charset=utf-8"], ["/favicon.svg", "favicon.svg", "image/svg+xml"]]) {
  const body = await readFile(path.join(DIR, "public", file));
  STATIC[url] = { body, type, etag: '"' + crypto.createHash("sha1").update(body).digest("base64url") + '"' };
}
const CSP = ["default-src 'self'", "script-src 'self' https://accounts.google.com/gsi/client", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: https://*.googleusercontent.com", "frame-src https://accounts.google.com/gsi/",
  "connect-src 'self' https://accounts.google.com/gsi/", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join("; ");
const SEC_HEADERS = { "content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000", "cross-origin-opener-policy": "same-origin-allow-popups" };

/* ---------- helpers ---------- */
const now = () => Date.now();
const isEmail = e => typeof e === "string" && /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const domainOk = e => !DOMAINS.length || DOMAINS.includes(e.split("@")[1]);
const str = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SEC_HEADERS, ...headers });
  res.end(body);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 1_000_000) throw new HttpError(413, "Request too large."); chunks.push(c); }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "Invalid JSON."); }
}
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k.toString("base64"))));
async function hashPassword(pw) { const salt = crypto.randomBytes(16).toString("base64"); return { salt, hash: await scrypt(pw, salt) }; }
async function checkPassword(pw, user) {
  if (!user?.passHash) { await scrypt(pw, "timing-pad"); return false; }
  const h = Buffer.from(await scrypt(pw, user.passSalt)), want = Buffer.from(user.passHash);
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

/* ---------- sessions: signed, stateless cookie ---------- */
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function makeCookie(user) {
  const b = Buffer.from(JSON.stringify({ e: user.email, v: user.sessionVersion || 1, exp: now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `drops_sess=${b}.${hmac(b)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? "; Secure" : ""}`;
}
const clearCookie = `drops_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${PROD ? "; Secure" : ""}`;
function readSession(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)drops_sess=([^;]+)/); if (!m) return null;
  const [b, sig] = m[1].split("."); if (!b || !sig) return null;
  const want = hmac(b); if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const p = JSON.parse(Buffer.from(b, "base64url").toString()); return p.exp > now() ? p : null; } catch { return null; }
}

/* ---------- user cache (cuts Firestore reads) ---------- */
const userCache = new Map();
async function getUser(email) {
  const c = userCache.get(email); if (c && now() - c.at < 60_000) return c.user;
  const user = await store.getUser(email); userCache.set(email, { user, at: now() }); return user;
}
async function putUser(email, data) { await store.putUser(email, data); userCache.delete(email); teamCache = null; }
let teamCache = null;
async function team() {
  if (teamCache && now() - teamCache.at < 60_000) return teamCache.list;
  const list = (await store.listUsers()).map(publicUser); teamCache = { list, at: now() }; return list;
}
const publicUser = u => ({ email: u.email, name: u.name || u.email.split("@")[0], role: u.role, status: u.status, provider: u.provider, createdAt: u.createdAt, picture: u.picture || "" });

async function auth(req, roles) {
  const s = readSession(req); if (!s) throw new HttpError(401, "Please sign in.");
  const u = await getUser(s.e);
  if (!u || u.status !== "active" || (u.sessionVersion || 1) !== s.v) throw new HttpError(401, "Please sign in.");
  if (roles && !roles.includes(u.role)) throw new HttpError(403, "You don't have permission to do that.");
  return u;
}

/* ---------- rate limits (per instance) ---------- */
const buckets = new Map();
function limit(key, max, windowMs) {
  const t = now(); const b = buckets.get(key) || { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n++; buckets.set(key, b);
  if (b.n > max) throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
}
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 300_000).unref();
const ip = req => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";

/* ---------- config ---------- */
let cfgCache = null;
async function getConfig() {
  if (cfgCache && now() - cfgCache.at < 60_000) return cfgCache.cfg;
  const c = await store.getConfig();
  const cfg = c ? { company: { ...DEFAULT_CFG.company, ...(c.company || {}) }, products: Array.isArray(c.products) && c.products.length ? c.products : DEFAULT_CFG.products } : DEFAULT_CFG;
  cfgCache = { cfg, at: now() }; return cfg;
}

/* ---------- leads ---------- */
const LEAD_FIELDS = { company: 200, contactName: 120, contactRole: 120, email: 200, phone: 60, website: 300, city: 80, country: 80, industry: 120, size: 20, signal: 500, notes: 8000 };
function cleanLead(body, existing) {
  const out = {};
  for (const [k, max] of Object.entries(LEAD_FIELDS)) if (k in body) out[k] = str(body[k], max);
  if ("product" in body) out.product = ["hr", "fin", "both"].includes(body.product) ? body.product : "hr";
  if ("stage" in body) out.stage = STAGES[body.stage] ? body.stage : "new";
  if ("nextFollowUp" in body) out.nextFollowUp = /^\d{4}-\d{2}-\d{2}$/.test(body.nextFollowUp || "") ? body.nextFollowUp : "";
  if ("ownerId" in body && (body.ownerId === "" || isEmail(body.ownerId))) out.ownerId = String(body.ownerId).toLowerCase();
  if (!existing && !out.company) throw new HttpError(400, "Company name is required.");
  if ("company" in out && !out.company) throw new HttpError(400, "Company name is required.");
  return out;
}
function cleanBrief(b) {
  const arr = a => Array.isArray(a) ? a.slice(0, 8).map(x => str(String(x), 400)) : [];
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  return { summary: str(String(b?.summary || ""), 600), fit: { hr: clamp(b?.fit?.hr), fin: clamp(b?.fit?.fin) },
    recommended: ["hr", "fin", "both", "none"].includes(b?.recommended) ? b.recommended : "none",
    why: arr(b?.why), pains: arr(b?.pains), contacts: arr(b?.contacts), opener: str(String(b?.opener || ""), 400), questions: arr(b?.questions), unknowns: arr(b?.unknowns) };
}

/* ---------- routes ---------- */
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), fn });

route("GET", "/healthz", async () => ({ ok: true }));
route("GET", "/api/public-config", async () => ({ domains: DOMAINS, approval: REQUIRE_APPROVAL, googleClientId: GOOGLE_CLIENT_ID, company: (await getConfig()).company.name }));
const appUrl = req => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

route("POST", "/api/auth/signup", async (req, res, body) => {
  limit("signup:" + ip(req), 10, 3600_000);
  const email = str(body.email, 254).toLowerCase(), name = str(body.name, 80), pw = typeof body.password === "string" ? body.password : "";
  if (!isEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!domainOk(email)) throw new HttpError(403, `Only ${DOMAINS.map(d => "@" + d).join(", ")} addresses can join.`);
  if (pw.length < 10 || pw.length > 200) throw new HttpError(400, "Use a password of at least 10 characters.");
  if (!name) throw new HttpError(400, "Enter your name.");
  const existing = await store.getUser(email);
  if (existing) throw new HttpError(409, "An account with this email already exists. Sign in instead, or ask an admin to reset your password.");
  const { salt, hash } = await hashPassword(pw);
  // An admin email signing up with a password must also present the setup code printed by deploy.sh,
  // because password sign-ups don't prove the person owns the mailbox.
  const code = String(body.setupCode || "");
  const SETUP = process.env.ADMIN_SETUP_CODE || (PROD ? "" : "dev");
  const isAdmin = ADMINS.includes(email) && !!SETUP && code.length === SETUP.length && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(SETUP));
  if (ADMINS.includes(email) && !isAdmin) throw new HttpError(403, "This is an admin address. Enter the admin setup code from the deploy output, or sign in with Google.");
  const user = { email, name, provider: "password", passSalt: salt, passHash: hash, createdAt: now(),
    role: isAdmin ? "admin" : "member", status: isAdmin || !REQUIRE_APPROVAL ? "active" : "pending", sessionVersion: 1 };
  await putUser(email, user);
  await notifySignup(user, appUrl(req));
  if (user.status === "active") { res.setHeader("set-cookie", makeCookie(user)); return { status: "active", user: publicUser(user) }; }
  return { status: "pending" };
});

route("POST", "/api/auth/login", async (req, res, body) => {
  const email = str(body.email, 254).toLowerCase();
  limit("login:" + ip(req), 30, 900_000); limit("login:" + email, 8, 900_000);
  const user = isEmail(email) ? await store.getUser(email) : null;
  const ok = await checkPassword(typeof body.password === "string" ? body.password : "", user);
  if (!ok) throw new HttpError(401, "Email or password is incorrect.");
  if (user.status === "pending") throw new HttpError(403, "Your account is waiting for an admin to approve it.");
  if (user.status !== "active") throw new HttpError(403, "This account has been disabled. Contact your admin.");
  if (ADMINS.includes(email) && user.role !== "admin") { user.role = "admin"; await putUser(email, { role: "admin" }); }
  res.setHeader("set-cookie", makeCookie(user));
  return { user: publicUser(user) };
});

route("POST", "/api/auth/google", async (req, res, body) => {
  if (!googleClient) throw new HttpError(404, "Google sign-in is not enabled.");
  limit("google:" + ip(req), 30, 900_000);
  let p;
  try { p = (await googleClient.verifyIdToken({ idToken: String(body.credential || ""), audience: GOOGLE_CLIENT_ID })).getPayload(); }
  catch { throw new HttpError(401, "Google sign-in failed. Try again."); }
  const email = String(p.email || "").toLowerCase();
  if (!p.email_verified || !isEmail(email)) throw new HttpError(401, "Google didn't confirm this email address.");
  if (!domainOk(email)) throw new HttpError(403, `Only ${DOMAINS.map(d => "@" + d).join(", ")} addresses can join.`);
  let user = await store.getUser(email);
  const isAdmin = ADMINS.includes(email);
  if (!user) {
    user = { email, name: str(p.name || "", 80) || email.split("@")[0], picture: str(p.picture || "", 500), provider: "google", createdAt: now(),
      role: isAdmin ? "admin" : "member", status: isAdmin || !REQUIRE_APPROVAL ? "active" : "pending", sessionVersion: 1 };
    await putUser(email, user);
    await notifySignup(user, appUrl(req));
  } else if (p.picture && user.picture !== p.picture) { await putUser(email, { picture: str(p.picture, 500) }); }
  if (user.status === "pending") return { status: "pending" };
  if (user.status !== "active") throw new HttpError(403, "This account has been disabled. Contact your admin.");
  res.setHeader("set-cookie", makeCookie(user));
  return { status: "active", user: publicUser(user) };
});

route("POST", "/api/auth/logout", async (req, res) => { res.setHeader("set-cookie", clearCookie); return { ok: true }; });

route("POST", "/api/auth/password", async (req, res, body) => {
  const u = await auth(req);
  limit("pw:" + u.email, 10, 900_000);
  if (u.passHash && !(await checkPassword(String(body.current || ""), u))) throw new HttpError(401, "Your current password is incorrect.");
  const pw = String(body.password || "");
  if (pw.length < 10 || pw.length > 200) throw new HttpError(400, "Use a password of at least 10 characters.");
  const { salt, hash } = await hashPassword(pw);
  const v = (u.sessionVersion || 1) + 1;
  await putUser(u.email, { passSalt: salt, passHash: hash, sessionVersion: v, mustChangePassword: false });
  res.setHeader("set-cookie", makeCookie({ ...u, sessionVersion: v }));
  return { ok: true };
});

route("GET", "/api/me", async req => { const u = await auth(req); return { user: { ...publicUser(u), settings: u.settings || {}, mustChangePassword: !!u.mustChangePassword, hasPassword: !!u.passHash } }; });
route("PUT", "/api/me/settings", async (req, res, body) => {
  const u = await auth(req);
  const settings = { name: str(body.name, 80), title: str(body.title, 80), phone: str(body.phone, 40), link: str(body.link, 300) };
  await putUser(u.email, { settings }); return { settings };
});

route("GET", "/api/team", async req => { await auth(req); return { team: (await team()).filter(t => t.status === "active").map(({ email, name, role, picture }) => ({ email, name, role, picture })) }; });

route("GET", "/api/admin/users", async req => { await auth(req, ["admin"]); teamCache = null; return { users: await team() }; });
route("PATCH", "/api/admin/users/:email", async (req, res, body, { email }) => {
  const me = await auth(req, ["admin"]);
  email = decodeURIComponent(email).toLowerCase();
  const u = await store.getUser(email); if (!u) throw new HttpError(404, "User not found.");
  const patch = {};
  if (body.role && ["admin", "member", "viewer"].includes(body.role)) patch.role = body.role;
  if (body.status && ["active", "disabled"].includes(body.status)) patch.status = body.status;
  if (email === me.email && (patch.role && patch.role !== "admin" || patch.status === "disabled")) throw new HttpError(400, "You can't remove your own admin access.");
  if (patch.status === "disabled" || (patch.role && patch.role !== u.role)) patch.sessionVersion = (u.sessionVersion || 1) + 1;
  if (patch.status === "active" && u.status === "pending") { patch.approvedBy = me.email; patch.approvedAt = now(); }
  await putUser(email, patch);
  return { user: publicUser({ ...u, ...patch }) };
});
route("POST", "/api/admin/users/:email/reset-password", async (req, res, body, { email }) => {
  await auth(req, ["admin"]);
  email = decodeURIComponent(email).toLowerCase();
  const u = await store.getUser(email); if (!u) throw new HttpError(404, "User not found.");
  const temp = crypto.randomBytes(9).toString("base64url");
  const { salt, hash } = await hashPassword(temp);
  await putUser(email, { passSalt: salt, passHash: hash, sessionVersion: (u.sessionVersion || 1) + 1, mustChangePassword: true });
  return { tempPassword: temp };
});

route("GET", "/api/config", async req => { await auth(req); return { config: await getConfig() }; });
route("PUT", "/api/config", async (req, res, body) => {
  await auth(req, ["admin"]);
  const c = body.config || {};
  const cfg = { company: { name: str(c.company?.name, 120) || DEFAULT_CFG.company.name, pitch: str(c.company?.pitch, 600), offerings: str(c.company?.offerings, 2000) },
    products: (Array.isArray(c.products) ? c.products : []).slice(0, 2).map((p, i) => ({ id: DEFAULT_CFG.products[i].id, name: str(p.name, 60) || DEFAULT_CFG.products[i].name,
      oneLiner: str(p.oneLiner, 300), idealCustomer: str(p.idealCustomer, 600), description: str(p.description, 6000) })) };
  if (cfg.products.length !== 2) throw new HttpError(400, "Both products are required.");
  await store.setConfig(cfg); cfgCache = null; return { config: cfg };
});

route("GET", "/api/leads", async (req, res, body, params, url) => {
  await auth(req);
  const since = Number(url.searchParams.get("since")) || 0;
  const serverTime = now();
  const leads = await store.listLeads(since);
  return { serverTime, leads: since ? leads : leads.filter(l => !l.deleted) };
});
route("POST", "/api/leads", async (req, res, body) => {
  const u = await auth(req, ["admin", "member"]);
  const data = cleanLead(body, null);
  const t = now();
  const lead = { product: "hr", stage: "new", size: "Unknown", nextFollowUp: "", ...data, ownerId: data.ownerId || u.email, createdBy: u.email, createdAt: t, updatedAt: t, deleted: false };
  if (lead.stage === "contacted") { lead.contactedAt = t; lead.contactedBy = u.email; }
  if (body.brief) { lead.brief = cleanBrief(body.brief); lead.fit = Math.max(lead.brief.fit.hr, lead.brief.fit.fin); lead.qualifiedAt = t; lead.qualifiedBy = u.email; }
  return { lead: await store.createLead(lead) };
});
route("PATCH", "/api/leads/:id", async (req, res, body, { id }) => {
  const u = await auth(req, ["admin", "member"]);
  const l = await store.getLead(id); if (!l || l.deleted) throw new HttpError(404, "Lead not found.");
  const patch = cleanLead(body, l); const t = now(); patch.updatedAt = t;
  if ((patch.stage === "contacted" && !l.contactedAt) || body.markContacted) { patch.contactedAt = t; patch.contactedBy = u.email; if (body.lastChannel) patch.lastChannel = str(body.lastChannel, 20); }
  if (body.markContacted && (l.stage || "new") === "new") patch.stage = "contacted";
  if (body.brief) { patch.brief = cleanBrief(body.brief); patch.fit = Math.max(patch.brief.fit.hr, patch.brief.fit.fin); patch.qualifiedAt = t; patch.qualifiedBy = u.email; }
  return { lead: await store.updateLead(id, patch) };
});
route("DELETE", "/api/leads/:id", async (req, res, body, { id }) => {
  const u = await auth(req, ["admin", "member"]);
  const l = await store.getLead(id); if (!l || l.deleted) throw new HttpError(404, "Lead not found.");
  if (u.role !== "admin" && l.ownerId !== u.email && l.createdBy !== u.email) throw new HttpError(403, "Only the lead's owner or an admin can delete it.");
  await store.updateLead(id, { deleted: true, updatedAt: now(), deletedBy: u.email });
  return { ok: true };
});

route("POST", "/api/ai/qualify", async (req, res, body) => {
  const u = await auth(req, ["admin", "member"]);
  limit("ai:" + u.email, 40, 600_000);
  const p = { company: str(body.company, 200), location: str(body.location, 160), industry: str(body.industry, 120), size: str(body.size, 20), text: str(body.text, 12000) };
  if (!p.company) throw new HttpError(400, "Company name is required.");
  try { return { brief: cleanBrief(await ai.json(qualifyPrompt(await getConfig(), p))) }; }
  catch (e) { console.error("qualify failed", e?.message); throw new HttpError(502, "The AI model didn't respond properly. Try again."); }
});
route("POST", "/api/ai/write", async (req, res, body) => {
  const u = await auth(req, ["admin", "member"]);
  limit("ai:" + u.email, 40, 600_000);
  const lead = await store.getLead(String(body.leadId || ""));
  if (!lead || lead.deleted) throw new HttpError(404, "Choose a lead first.");
  const opts = { channel: CHANNELS.includes(body.channel) ? body.channel : "email", lang: LANGS.includes(body.lang) ? body.lang : "English",
    tone: str(body.tone, 40), product: ["auto", "hr", "fin", "both"].includes(body.product) ? body.product : "auto", extra: str(body.extra, 2000) };
  const cfg = await getConfig(); const s = u.settings || {};
  const signature = [s.name || u.name, s.title, cfg.company.name, s.phone, s.link && "Book a demo: " + s.link].filter(Boolean).join("\n");
  const ctl = new AbortController(); res.on("close", () => { if (!res.writableFinished) ctl.abort(); });
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", ...SEC_HEADERS });
  try { await ai.stream(writePrompt(cfg, lead, opts, signature), t => res.write(t), ctl.signal); }
  catch (e) { if (!ctl.signal.aborted) { console.error("write failed", e?.message); res.write("\n\n[The AI model stopped early. Try again.]"); } }
  res.end();
  return undefined;
});

/* ---------- extract ---------- */
async function schedulerCaller(req) {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m || !EXTRACT_INVOKER || !oidcVerifier) return false;
  try {
    const p = (await oidcVerifier.verifyIdToken({ idToken: m[1], audience: EXTRACT_AUDIENCE })).getPayload();
    return p.email_verified && String(p.email).toLowerCase() === EXTRACT_INVOKER;
  } catch { return false; }
}
route("POST", "/api/extract/run", async req => {
  let trigger = "schedule";
  if (!(await schedulerCaller(req))) { const u = await auth(req, ["admin"]); trigger = "manual:" + u.email; limit("extract:" + u.email, 6, 3600_000); }
  const r = await runExtract({ store, ai, trigger });
  console.log("extract run", JSON.stringify({ trigger, added: r.added, seen: r.seen, dropped: r.dropped, errors: r.errors, skipped: r.skipped }));
  return r;
});
const publicState = s => ({ lastRun: s.lastRun || null, lastSuccessAt: s.lastSuccessAt || 0, totalAdded: s.totalAdded || 0, running: !!(s.runningSince && Date.now() - s.runningSince < 9 * 60_000) });
route("GET", "/api/extracts", async (req, res, body, params, url) => {
  await auth(req);
  const since = Number(url.searchParams.get("since")) || 0;
  const serverTime = now();
  const [items, state, total] = await Promise.all([store.listExtracts(since), store.getExtractState(), store.countExtracts()]);
  return { serverTime, items, total, state: publicState(state), intents: INTENTS };
});
const EX_STATUS = ["new", "contacted", "interested", "not_relevant"];
route("PATCH", "/api/extracts/:id", async (req, res, body, { id }) => {
  const u = await auth(req, ["admin", "member"]);
  const x = await store.getExtract(id); if (!x) throw new HttpError(404, "Record not found.");
  const patch = { updatedAt: now() };
  if ("remarks" in body) { patch.remarks = str(body.remarks, 4000); patch.remarksBy = u.email; patch.remarksAt = now(); }
  if ("status" in body) { if (!EX_STATUS.includes(body.status)) throw new HttpError(400, "Unknown status."); patch.status = body.status; }
  return { item: await store.updateExtract(id, patch) };
});
route("POST", "/api/extracts/:id/to-pipeline", async (req, res, body, { id }) => {
  const u = await auth(req, ["admin", "member"]);
  const x = await store.getExtract(id); if (!x) throw new HttpError(404, "Record not found.");
  if (x.leadId) { const l = await store.getLead(x.leadId); if (l && !l.deleted) return { lead: l, item: x }; }
  const t = now(); const [city, ...rest] = (x.location || "").split(",").map(s => s.trim());
  const product = x.intent === "hr" ? "hr" : x.intent === "finance" ? "fin" : "both";
  const lead = await store.createLead({ company: str(x.company || x.personName || x.title, 200), contactName: str(x.personName, 120), contactRole: "", email: str(x.contactEmail, 200),
    phone: str(x.contactPhone, 60), website: str(x.contactUrl || x.sourceUrl, 300), city: city || "", country: rest.join(", "), industry: "", size: "Unknown", product, stage: "new",
    nextFollowUp: new Date(t + 864e5).toISOString().slice(0, 10), signal: str(`${INTENTS[x.intent] || "Extract"}: ${x.title} (${x.platform})`, 500),
    notes: str([x.need, x.budget && "Budget: " + x.budget, "Source: " + x.sourceUrl, x.remarks && "Remarks: " + x.remarks].filter(Boolean).join("\n"), 8000),
    ownerId: u.email, createdBy: u.email, createdAt: t, updatedAt: t, deleted: false });
  const item = await store.updateExtract(id, { leadId: lead.id, updatedAt: now(), status: x.status === "new" ? "contacted" : x.status });
  return { lead, item };
});
route("POST", "/api/extracts/:id/message", async (req, res, body, { id }) => {
  const u = await auth(req, ["admin", "member"]);
  limit("ai:" + u.email, 40, 600_000);
  const x = await store.getExtract(id); if (!x) throw new HttpError(404, "Record not found.");
  const opts = { channel: EX_CHANNELS.includes(body.channel) ? body.channel : "dm", lang: LANGS.includes(body.lang) ? body.lang : "English", extra: str(body.extra, 1000) };
  const cfg = await getConfig(); const s = u.settings || {};
  const signature = [s.name || u.name, s.title, cfg.company.name, s.phone, s.link && "Book a call: " + s.link].filter(Boolean).join("\n");
  const ctl = new AbortController(); res.on("close", () => { if (!res.writableFinished) ctl.abort(); });
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", ...SEC_HEADERS });
  try { await ai.stream(extractMessagePrompt(cfg, x, opts, signature), t => res.write(t), ctl.signal); }
  catch (e) { if (!ctl.signal.aborted) { console.error("extract message failed", e?.message); res.write("\n\n[The AI model stopped early. Try again.]"); } }
  res.end();
  return undefined;
});

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && STATIC[url.pathname]) {
      const f = STATIC[url.pathname];
      if (req.headers["if-none-match"] === f.etag) { res.writeHead(304, { etag: f.etag }); return res.end(); }
      res.writeHead(200, { "content-type": f.type, etag: f.etag, "cache-control": "no-cache", ...SEC_HEADERS });
      return res.end(f.body);
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re); if (!m) continue;
      if (req.method !== "GET" && req.headers["x-cg"] !== "1") throw new HttpError(403, "Missing request header.");
      const body = req.method === "GET" ? {} : await readBody(req);
      const out = await r.fn(req, res, body, m.groups || {}, url);
      if (out !== undefined && !res.headersSent) send(res, 200, out);
      return;
    }
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) { const f = STATIC["/"]; res.writeHead(200, { "content-type": f.type, "cache-control": "no-cache", ...SEC_HEADERS }); return res.end(f.body); }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? "Something went wrong on the server." : e.message });
    else res.end();
  }
});
server.listen(PORT, () => console.log(`Drops Lead Desk on :${PORT} (store: ${store.kind}, model: ${ai.model}, domains: ${DOMAINS.join(",") || "any"}, approval: ${REQUIRE_APPROVAL}, notify: ${notifyChannels().join("+") || "none"})`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
