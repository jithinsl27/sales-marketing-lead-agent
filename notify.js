// Tells the admins when someone new signs up: by email (Gmail SMTP with an app password) and/or a chat webhook.
const NOTIFY_TO = (process.env.NOTIFY_EMAILS || process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const WEBHOOK = process.env.NOTIFY_WEBHOOK_URL || "";

let transport = null;
async function mailer() {
  if (transport || !SMTP_USER || !SMTP_PASS || !NOTIFY_TO.length) return transport;
  const nodemailer = (await import("nodemailer")).default;
  transport = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return transport;
}
export const notifyChannels = () => [SMTP_USER && SMTP_PASS && NOTIFY_TO.length ? "email" : null, WEBHOOK ? "webhook" : null].filter(Boolean);

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);

// Awaited by the caller (Cloud Run only gives CPU during a request), but never throws.
export async function notifySignup(u, appUrl) {
  const when = new Date(u.createdAt || Date.now()).toUTCString();
  const status = u.status === "pending" ? "Waiting for your approval" : "Active (can use the app now)";
  const lines = [`Name: ${u.name}`, `Email: ${u.email}`, `Signed up with: ${u.provider === "google" ? "Google" : "Email and password"}`, `Status: ${status}`, `Time: ${when}`];
  const jobs = [];
  const t = await mailer().catch(e => { console.error("mailer init failed", e.message); return null; });
  if (t) jobs.push(t.sendMail({
    from: `Drops Lead Desk <${SMTP_USER}>`, to: NOTIFY_TO.join(","),
    subject: `New sign-up: ${u.name} (${u.email})`,
    text: `Someone new joined Drops Lead Desk.\n\n${lines.join("\n")}\n\n${appUrl ? "Manage the team: " + appUrl + "/#team" : ""}`
  }));
  if (WEBHOOK) jobs.push(fetch(WEBHOOK, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `New Lead Desk sign-up\n${lines.join("\n")}` }) }));
  const results = await Promise.allSettled(jobs.map(j => withTimeout(j, 8000)));
  results.forEach(r => { if (r.status === "rejected") console.error("signup notification failed:", r.reason?.message || r.reason); });
}
