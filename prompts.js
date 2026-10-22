// Default product details and the prompts sent to Gemini. Product details can be edited in the app (Products tab).
export const DEFAULT_CFG = {
  company: { name: "Drops", pitch: "Practical HR and finance software for growing small and mid-size businesses in India and the Middle East.",
    offerings: "Drops HR (HR, attendance and AI HR chatbot), Fin360 (billing, purchases, inventory and finance dashboard) and Drops CRM (sales pipeline and customer management). Drops also builds custom software for clients: web apps, mobile apps, websites, SaaS products and AI chatbots/agents, with a team experienced in Node.js, React, Python and Google Cloud." },
  products: [
    { id: "hr", name: "Drops HR", oneLiner: "AI-powered HR: live workforce dashboard, 24/7 employee HR chatbot and facial-recognition attendance.",
      idealCustomer: "SMBs with 20–500 employees, shift or field staff, growing headcount, still running HR and attendance on Excel, registers or WhatsApp.",
      description: "Real-time workforce dashboard: headcount, contractor ratio, growth trends; active/inactive, remote/onsite and leave status; department analytics (span of control, team health, overtime patterns); attrition trends with voluntary/involuntary split and risk alerts; AI flight-risk scoring and talent-gap forecasting.\nAI HR chatbot: 24/7 employee self-service for payroll, leave, benefits and policy questions; instant policy lookup; secure, encrypted token-based sessions; conversations continue across sessions.\nFacial-recognition attendance and access control: touchless identity check in under one second; controlled enrolment; one-to-one link to employee records; stops buddy punching, badge fraud and time theft.\nScales from startup to growing company. Early adopters get new features first and hands-on support." },
    { id: "fin", name: "Fin360", oneLiner: "One system for billing, purchases, inventory and a live finance dashboard.",
      idealCustomer: "Trading, distribution, manufacturing, retail and service SMBs with stock and several branches, outgrowing spreadsheets or basic accounting software.",
      description: "Live finance dashboard: cash, sales, purchases, receivables, payables and stock with drill-downs; receivables and payables ageing; profitability by customer, product or category; monthly/quarterly trends against budget; export-ready reports for management and audit.\nSales and billing: quotation → order → delivery → invoice → receipt in one flow; tax-compliant invoices with pricing, discounts and payment terms; receipts, advances and credit notes against open invoices; full customer ledgers.\nPurchases: purchase dashboard of open POs, pending bills and approvals; vendor profiles with terms and GST/tax details; PO-to-bill matching with approvals; payment planning by due date and cash; spend analytics.\nInventory: live on-hand, reserved and incoming stock by item, warehouse and branch; automatic stock movements; inter-warehouse transfers; costing and valuation; low-stock and slow-moving alerts.\nAdmin: role-based access, activity and audit logs, configurable fiscal year, currencies, tax rules and document numbering; multi-branch and multi-entity." }
  ]
};

export const STAGES = { new: "New", contacted: "Contacted", replied: "Replied", demo: "Demo booked", proposal: "Proposal sent", won: "Won", lost: "Lost" };
const MARKET_NOTE = "Market priority: India first, then the Middle East (UAE, Saudi Arabia, Qatar, Oman, Bahrain, Kuwait). Buyers are owners, directors, HR heads and finance or accounts heads of small and mid-size businesses.";

const prodName = (cfg, id) => id === "both" ? "both products" : (cfg.products.find(p => p.id === id)?.name || id);
const productsBlock = cfg => cfg.products.map(p => `### ${p.name} (id: ${p.id})\n${p.oneLiner}\nIdeal customer: ${p.idealCustomer}\nFeatures:\n${p.description}`).join("\n\n");

function leadBlock(l) {
  const b = l.brief;
  return [`Company: ${l.company}`, l.contactName && `Contact: ${l.contactName}${l.contactRole ? " (" + l.contactRole + ")" : ""}`,
    (l.city || l.country) && `Location: ${[l.city, l.country].filter(Boolean).join(", ")}`, l.industry && `Industry: ${l.industry}`,
    l.size && l.size !== "Unknown" && `Employees: ${l.size}`, l.signal && `Why we picked them: ${l.signal}`, l.stage && `Stage: ${STAGES[l.stage] || l.stage}`,
    l.notes && `Notes: ${String(l.notes).slice(0, 3000)}`,
    b && `Qualification brief: ${b.summary || ""}\nLikely pains: ${(b.pains || []).join("; ")}\nSuggested opener: ${b.opener || ""}`].filter(Boolean).join("\n");
}

export function qualifyPrompt(cfg, p) {
  return `You are a B2B sales analyst for ${cfg.company.name}. ${cfg.company.pitch}
${MARKET_NOTE}

Our products:
${productsBlock(cfg)}

Assess this prospect using ONLY the information below. Never invent facts about the company such as revenue, headcount, tools or people. If something is not stated, put it under "unknowns". Base pain points on the industry, size and location, phrased as hypotheses to test. If the information is thin, give moderate scores and say so.

Prospect
Company: ${p.company}
Location: ${p.location || "not given"}
Industry: ${p.industry || "not given"}
Employees: ${p.size || "Unknown"}
What we know:
"""
${(p.text || "(nothing pasted)").slice(0, 12000)}
"""

Reply with only a JSON object in exactly this shape:
{"summary": "one sentence on what the company does, or 'Not enough information'", "fit": {"hr": 0-100, "fin": 0-100}, "recommended": "hr" | "fin" | "both" | "none", "why": ["2-3 short reasons"], "pains": ["2-4 likely pain points"], "contacts": ["2-3 entries like 'Founder / MD — signs off on software'"], "opener": "one personalised first line for outreach, no flattery, under 30 words", "questions": ["4 discovery questions"], "unknowns": ["what to verify"]}`;
}

const CH_RULES = {
  email: "Write one cold email: a subject line on the first line as 'Subject: …', then the body under 120 words. One clear call to action: a 20-minute demo this week. End with the signature.",
  linkedin: "Write two LinkedIn messages: (1) a connection request note under 280 characters, no pitch; (2) a follow-up message after they accept, under 90 words, ending with a soft question. Label them '1. Connection note' and '2. After they accept'.",
  whatsapp: "Write one WhatsApp message under 60 words, conversational, plain text, one question at the end. Assume the contact shared their number or we met; do not pretend we know them otherwise.",
  sequence: "Write a 3-step email follow-up sequence for someone who has not replied: Day 3, Day 7 and Day 14. Each under 80 words with its own subject line. Each step adds a new angle (a specific pain, a quick win, a polite close-the-loop). Label each step.",
  call: "Write a phone call script: a 20-second opener, 5 discovery questions, short answers to the 3 most likely objections for this kind of business, and how to book the demo. Use short spoken sentences.",
  objection: "The prospect raised the objection given below. Write a short, respectful reply that acknowledges it, answers with one concrete point from our product features, and suggests a low-commitment next step. Under 100 words. Then add 'Why this works:' with one line for the salesperson."
};
const LANG_RULES = {
  English: "Write in clear, simple English suited to Indian and Gulf business readers.",
  Hindi: "Write in simple business Hindi in Devanagari script. Keep product names and technical terms in English.",
  Hinglish: "Write in Hinglish (Hindi in Roman script mixed with English), as Indian business owners text each other.",
  Arabic: "Write in Modern Standard Arabic with a respectful Gulf business tone. Keep product names in English.",
  Tamil: "Write in Tamil script. Keep product names in English.",
  Telugu: "Write in Telugu script. Keep product names in English.",
  Malayalam: "Write in Malayalam script. Keep product names in English."
};
export const CHANNELS = Object.keys(CH_RULES);
export const LANGS = Object.keys(LANG_RULES);
const TONES = ["Friendly and direct", "Formal and respectful", "Short and casual"];

export function writePrompt(cfg, lead, opts, signature) {
  const pitch = opts.product === "auto" || !opts.product ? "Pick the product that best fits this lead (use the brief if present)."
    : `Pitch ${prodName(cfg, opts.product)}${opts.product === "both" ? ", leading with the one that fits best" : ""}.`;
  const tone = TONES.includes(opts.tone) ? opts.tone : TONES[0];
  const extra = String(opts.extra || "").slice(0, 2000);
  return `You write sales outreach for ${cfg.company.name}. ${cfg.company.pitch}
${MARKET_NOTE}

Our products:
${productsBlock(cfg)}

The lead:
${leadBlock(lead)}

Task: ${CH_RULES[opts.channel] || CH_RULES.email}
${pitch}
Tone: ${tone}. ${LANG_RULES[opts.lang] || LANG_RULES.English}
${extra ? (opts.channel === "objection" ? "Prospect's objection: " : "Salesperson's notes to include: ") + extra : ""}
Sender signature (use as given; leave out empty parts):
${signature || "(no signature set)"}

Rules: Mention only features listed in our product information. Do not invent statistics, customer names, awards, prices, discounts or deadlines. Do not claim we know the prospect or have met unless the notes say so. Refer to one specific detail about the lead when available. Plain text only, no markdown symbols, no placeholders in square brackets except the contact's name if unknown.`;
}

// Personalised reply to someone found by Extract.
const EX_INTENT = { build: "wants a freelancer or agency to build something", hr: "is looking for HR software", crm: "is looking for a CRM", finance: "is looking for finance or accounting software" };
const EX_CHANNEL = {
  reply: "a public reply or comment under their post: under 70 words, helpful first, no hard sell, invite them to DM or book a call",
  dm: "a private message (LinkedIn DM / platform message): under 110 words, reference their exact requirement, one clear next step",
  email: "an email: 'Subject: ...' on the first line, then under 140 words, reference their requirement, propose a 20-minute call",
  proposal: "a short freelance proposal/bid: under 180 words, restate their requirement in one line, how we'd approach it in 3 bullet-like lines (plain text with dashes), rough timeline if the post gives enough detail, one question to clarify scope"
};
export const EX_CHANNELS = Object.keys(EX_CHANNEL);
export function extractMessagePrompt(cfg, x, opts, signature) {
  const products = cfg.products.map(p => `- ${p.name}: ${p.oneLiner}`).join("\n");
  return `You write outreach for ${cfg.company.name}. ${cfg.company.pitch}
What we offer: ${cfg.company.offerings || ""}
Products:
${products}

We found a public post by someone who ${EX_INTENT[x.intent] || "has a software need"}.
Post headline: ${x.title}
Their requirement: ${x.need || "(no detail)"}
${x.personName ? "Author: " + x.personName : ""}${x.company ? "\nCompany: " + x.company : ""}${x.location ? "\nLocation: " + x.location : ""}${x.budget ? "\nBudget stated: " + x.budget : ""}
Platform: ${x.platform}
${x.remarks ? "Sales team notes: " + String(x.remarks).slice(0, 1500) : ""}

Write ${EX_CHANNEL[opts.channel] || EX_CHANNEL.dm}.
${LANG_RULES[opts.lang] || LANG_RULES.English}
${opts.extra ? "Also include: " + String(opts.extra).slice(0, 1000) : ""}
Match their need to the most relevant thing we offer and say specifically how it solves what they described. Address them by first name if the author's name is known.
Sign off with (leave out empty parts):
${signature || cfg.company.name}

Rules: do not invent facts about them, our clients, case studies, prices, discounts or deadlines; mention only offerings listed above; plain text only, no markdown symbols or square-bracket placeholders.`;
}
