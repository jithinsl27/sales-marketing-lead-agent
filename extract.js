// Extract: finds public posts (LinkedIn first, then other social media) from people who are looking for
//   - a CRM, finance/accounting software, HR software, or another software solution
//   - a freelancer or agency to build software, apps, websites or AI solutions
// Sources: Gemini with Google Search grounding (covers public LinkedIn posts indexed by Google, Reddit, Quora,
// forums and other open sites) and Freelancer.com's public active-projects feed.
// Only details the poster published in the post are kept; nothing is looked up about individuals.
import crypto from "node:crypto";

export const INTENTS = {
  crm: "CRM",
  finance: "Finance",
  hr: "HR",
  build: "Freelance",
  other: "Other solutions"
};

// Each run takes the next step(s): LinkedIn first, then other social media, across all five needs.
const PHRASES = {
  crm: ['"looking for a CRM"', '"recommend a CRM"', '"need a CRM"', '"CRM suggestions"', '"which CRM"'],
  finance: ['"looking for accounting software"', '"recommend accounting software"', '"need an ERP"', '"inventory software" recommendation', '"moving from Tally"'],
  hr: ['"looking for HR software"', '"recommend an HRMS"', '"payroll software" recommendation', '"attendance software" suggestions', '"need HR software"'],
  build: ['"looking for a freelancer"', '"looking for a developer"', '"need someone to build"', '"looking for an agency"', '"hiring a freelance developer"'],
  other: ['"looking for a solution"', '"looking for software"', '"need an app"', '"looking for automation"', '"can anyone recommend a tool"']
};
const FOCUS = {
  crm: "business owners or sales leaders looking for a CRM, asking for CRM recommendations, or wanting someone to set up or build a CRM",
  finance: "business owners or finance/accounts teams looking for accounting, invoicing, billing, inventory or ERP software (for example moving off Tally or Excel)",
  hr: "founders or HR managers looking for HR software, HRMS, payroll, attendance or employee-management tools",
  build: "people or companies looking for a freelancer, developer or agency to build a web app, mobile app, website, SaaS product, AI chatbot or AI agent (project work, not full-time jobs)",
  other: "business owners looking for a software solution, tool, automation or custom system for a business problem that is not CRM, HR or finance software"
};
const WHERE = [
  { name: "LinkedIn", sites: "site:linkedin.com/posts OR site:linkedin.com/feed", label: "LinkedIn posts" },
  { name: "social", sites: "site:reddit.com OR site:x.com OR site:twitter.com OR site:facebook.com OR site:quora.com", label: "Reddit, X, Facebook and Quora" }
];
const WEB_PLAN = WHERE.flatMap(w => Object.keys(INTENTS).map(intent => ({ intent, where: w, focus: FOCUS[intent], phrases: PHRASES[intent] })));
const MARKETS = ["India", "the UAE and Saudi Arabia", "India", "the Middle East (Qatar, Oman, Bahrain, Kuwait)", "India", "anywhere (global, English-language)"];

const FREELANCER_QUERIES = {
  build: ["web application development", "mobile app development", "website development", "AI chatbot", "SaaS development", "AI agent"],
  hr: ["HR software", "HRMS", "payroll software", "attendance system"],
  crm: ["CRM", "CRM development", "Zoho CRM", "HubSpot"],
  finance: ["accounting software", "ERP", "inventory management system", "invoice software"],
  other: ["automation", "custom software", "dashboard", "booking system"]
};

const str = (v, max) => (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
const idFor = url => crypto.createHash("sha1").update(normUrl(url)).digest("hex").slice(0, 24);
function normUrl(u) {
  try { const x = new URL(u); x.hash = ""; for (const k of [...x.searchParams.keys()]) if (/^utm_|^ref|^trk|^src$/i.test(k)) x.searchParams.delete(k);
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + (x.search || "")).toLowerCase(); } catch { return String(u).toLowerCase(); }
}
const isHttp = u => { try { return ["http:", "https:"].includes(new URL(u).protocol); } catch { return false; } };
const hostOf = u => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

/* ---------- Web (Gemini + Google Search) ---------- */
function webPrompt(step, market) {
  const since = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const loc = /anywhere/.test(market) ? "" : " " + market.replace(/^the /, "").split(" (")[0].replace(" and ", " OR ");
  return `INTENT=${step.intent}
Use Google Search to find real, public ${step.where.label} published on or after ${since} from ${step.focus}.
Focus on ${market}.
Run several searches like these (vary the phrases):
${step.phrases.slice(0, 4).map(p => `  ${step.where.sites} ${p}${loc}`).join("\n")}

Rules:
- Only include posts where the author is a potential BUYER with that need. Exclude vendor ads, agencies promoting themselves, full-time job listings, listicles and news articles.
- Every item must come from a page you actually found in the search results, with that page's exact URL in "sourceUrl".
- Copy contact details only if the author published them in that post (email, phone, website or profile link). Never guess, construct or look up contact details. Leave a field "" if not stated.
- "location" is the city/country stated or clearly implied by the post. Never a street or home address.
- Up to 10 items, newest first. If you find none, return [].

Reply with only a JSON array of objects with these string fields:
[{"title": "short headline of what they need", "need": "1-2 sentence summary of the requirement, budget or timeline if stated", "personName": "", "company": "", "location": "", "contactEmail": "", "contactPhone": "", "contactUrl": "", "platform": "LinkedIn | Reddit | ...", "sourceUrl": "", "postedDate": "YYYY-MM-DD or ''", "budget": ""}]`;
}

async function fromWeb(ai, step, market, signal) {
  const { text, sources } = await ai.search(webPrompt(step, market), signal);
  if (!sources.length) return { items: [], dropped: 0 };
  const domains = new Set(sources.flatMap(s => [s.domain, s.title, hostOf(s.uri)]).filter(Boolean).map(d => d.toLowerCase().replace(/^www\./, "")));
  let list = [];
  try { list = JSON.parse((text.match(/\[[\s\S]*\]/) || ["[]"])[0]); } catch { list = []; }
  const items = []; let dropped = 0;
  for (const r of Array.isArray(list) ? list : []) {
    const url = str(r?.sourceUrl, 600);
    const host = hostOf(url);
    // Keep only items whose page domain is among the sources Google Search actually returned.
    const grounded = host && [...domains].some(d => host === d || host.endsWith("." + d) || d.endsWith("." + host));
    if (!isHttp(url) || !grounded || !str(r?.title, 10)) { dropped++; continue; }
    const email = str(r.contactEmail, 200);
    items.push({
      id: idFor(url), source: "web", intent: step.intent, platform: str(r.platform, 40) || (step.where.name === "LinkedIn" ? "LinkedIn" : host), title: str(r.title, 200), need: str(r.need, 600),
      personName: str(r.personName, 120), company: str(r.company, 160), location: str(r.location, 120),
      contactEmail: EMAIL.test(email) ? email : "", contactPhone: str(r.contactPhone, 40).replace(/[^\d+()\-\s]/g, ""),
      contactUrl: isHttp(r.contactUrl) ? str(r.contactUrl, 400) : "", sourceUrl: url,
      postedDate: /^\d{4}-\d{2}-\d{2}$/.test(r.postedDate || "") ? r.postedDate : "", budget: str(r.budget, 80)
    });
  }
  return { items, dropped };
}

/* ---------- Freelancer.com public feed ---------- */
async function fromFreelancer(intent, query, signal) {
  if (process.env.DEV_FAKE_AI) return [];
  const url = "https://www.freelancer.com/api/projects/0.1/projects/active/?" + new URLSearchParams({ query, limit: "20", full_description: "false", compact: "true" });
  const res = await fetch(url, { signal, headers: { "user-agent": "DropsLeadDesk/1.0", accept: "application/json" } });
  if (!res.ok) throw new Error(`Freelancer.com ${res.status}`);
  const j = await res.json();
  const cutoff = Date.now() / 1000 - 3 * 86400;
  return (j?.result?.projects || []).filter(p => (p.time_submitted || 0) >= cutoff).map(p => {
    const link = p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`;
    const loc = [p.location?.city, p.location?.country?.name].filter(Boolean).join(", ");
    const budget = p.budget ? `${p.currency?.sign || ""}${p.budget.minimum ?? ""}${p.budget.maximum ? "–" + p.budget.maximum : ""} ${p.currency?.code || ""}`.trim() : "";
    return { id: idFor(link), source: "freelancer", intent, platform: "Freelancer.com", title: str(p.title, 200), need: str(p.preview_description, 600),
      personName: "", company: "", location: loc, contactEmail: "", contactPhone: "", contactUrl: link, sourceUrl: link,
      postedDate: p.time_submitted ? new Date(p.time_submitted * 1000).toISOString().slice(0, 10) : "", budget };
  });
}

/* ---------- one run ---------- */
// Saves records as each source finishes (so the table fills in live), reports progress,
// and stops early when an admin presses Stop (checked every few seconds, works across instances).
export async function runExtract({ store, ai, trigger }) {
  const started = Date.now();
  const lock = await store.acquireExtractLock(started, 9 * 60_000);
  if (!lock.ok) return { skipped: true, reason: "An extract is already running." };
  const state = lock.state || {};
  if (trigger === "schedule" && state.paused) { await store.setExtractState({ runningSince: 0 }); return { skipped: true, reason: "Automatic extract is paused." }; }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 240_000);
  const report = { trigger, startedAt: started, added: 0, seen: 0, dropped: 0, bySource: {}, errors: [], cancelled: false };
  const n = state.rotation || 0;
  const seen = new Set();
  const progress = phase => store.setExtractState({ progress: { phase, added: report.added, at: Date.now() } }).catch(() => {});
  const watcher = setInterval(async () => {
    try { const s = await store.getExtractState(); if ((s.cancelRequestedAt || 0) >= started) { report.cancelled = true; ctl.abort(); } } catch {}
  }, 4000);
  const save = async items => {
    for (const c of items) {
      if (seen.has(c.id)) continue; seen.add(c.id); report.seen++;
      const ts = Date.now(); // stamped at write time so browsers that sync mid-run pick every record up
      const created = await store.createExtractIfNew(c.id, { ...c, addedAt: ts, updatedAt: ts, remarks: "", status: "new" });
      if (created) { report.added++; report.bySource[c.source] = (report.bySource[c.source] || 0) + 1; }
    }
  };
  try {
    await progress("Starting");
    // Web: grounded searches, rotating through intents and markets (keeps Google Search grounding inside the free monthly allowance).
    const perRun = Math.max(1, Math.min(4, Number(process.env.EXTRACT_WEB_SEARCHES_PER_RUN || 1)));
    for (let i = 0; i < perRun && !ctl.signal.aborted; i++) {
      const k = n * perRun + i;
      const step = WEB_PLAN[k % WEB_PLAN.length], market = MARKETS[Math.floor(k / WEB_PLAN.length) % MARKETS.length];
      await progress(`Searching ${step.where.label}: ${INTENTS[step.intent]} · ${market}`);
      try { const r = await fromWeb(ai, step, market, ctl.signal); report.dropped += r.dropped; await save(r.items); }
      catch (e) { if (!ctl.signal.aborted) report.errors.push(`Web search (${step.intent}): ${e.message}`); }
    }
    // Freelancer.com: a few queries per run, rotating.
    const fq = Object.entries(FREELANCER_QUERIES).flatMap(([intent, qs]) => qs.map(q => [intent, q]));
    const picks = Array.from({ length: 4 }, (_, i) => fq[(n * 4 + i) % fq.length]);
    for (const [intent, q] of picks) {
      if (ctl.signal.aborted) break;
      await progress(`Checking Freelancer.com: "${q}"`);
      try { await save(await fromFreelancer(intent, q, ctl.signal)); }
      catch (e) { if (!ctl.signal.aborted) report.errors.push(`Freelancer.com (${q}): ${e.message}`); }
    }
    if (ctl.signal.aborted && !report.cancelled) report.errors.push("Stopped after the 4-minute time limit.");
  } finally {
    clearTimeout(timer); clearInterval(watcher);
    report.finishedAt = Date.now();
    await store.setExtractState({ runningSince: 0, progress: null, rotation: n + 1, lastRun: report,
      lastSuccessAt: report.errors.length < 1 && !report.cancelled ? report.finishedAt : (state.lastSuccessAt || 0),
      totalAdded: (state.totalAdded || 0) + report.added });
  }
  return report;
}
