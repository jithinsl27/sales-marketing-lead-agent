"use strict";
/* ---------- static data ---------- */
const DEFAULT_CFG = {
  company: { name: "Drops", pitch: "Practical HR and finance software for growing small and mid-size businesses in India and the Middle East." },
  products: [
    { id: "hr", name: "Drops HR", oneLiner: "AI-powered HR: live workforce dashboard, 24/7 employee HR chatbot and facial-recognition attendance.",
      idealCustomer: "SMBs with 20–500 employees, shift or field staff, growing headcount, still running HR and attendance on Excel, registers or WhatsApp.",
      description: "Real-time workforce dashboard: headcount, contractor ratio, growth trends; active/inactive, remote/onsite and leave status; department analytics (span of control, team health, overtime patterns); attrition trends with voluntary/involuntary split and risk alerts; AI flight-risk scoring and talent-gap forecasting.\nAI HR chatbot: 24/7 employee self-service for payroll, leave, benefits and policy questions; instant policy lookup; secure, encrypted token-based sessions; conversations continue across sessions.\nFacial-recognition attendance and access control: touchless identity check in under one second; controlled enrolment; one-to-one link to employee records; stops buddy punching, badge fraud and time theft.\nScales from startup to growing company. Early adopters get new features first and hands-on support." },
    { id: "fin", name: "Fin360", oneLiner: "One system for billing, purchases, inventory and a live finance dashboard.",
      idealCustomer: "Trading, distribution, manufacturing, retail and service SMBs with stock and several branches, outgrowing spreadsheets or basic accounting software.",
      description: "Live finance dashboard: cash, sales, purchases, receivables, payables and stock with drill-downs; receivables and payables ageing; profitability by customer, product or category; monthly/quarterly trends against budget; export-ready reports for management and audit.\nSales and billing: quotation → order → delivery → invoice → receipt in one flow; tax-compliant invoices with pricing, discounts and payment terms; receipts, advances and credit notes against open invoices; full customer ledgers.\nPurchases: purchase dashboard of open POs, pending bills and approvals; vendor profiles with terms and GST/tax details; PO-to-bill matching with approvals; payment planning by due date and cash; spend analytics.\nInventory: live on-hand, reserved and incoming stock by item, warehouse and branch; automatic stock movements; inter-warehouse transfers; costing and valuation; low-stock and slow-moving alerts.\nAdmin: role-based access, activity and audit logs, configurable fiscal year, currencies, tax rules and document numbering; multi-branch and multi-entity." }
  ]
};
const STAGES = [
  ["new","New"],["contacted","Contacted"],["replied","Replied"],["demo","Demo booked"],["proposal","Proposal sent"],["won","Won"],["lost","Lost"]
];
const STAGE_COLOR = {new:"var(--line)",contacted:"var(--accent)",replied:"var(--hr)",demo:"var(--signal)",proposal:"var(--signal)",won:"var(--good)",lost:"var(--bad)"};
const SIZES = ["Unknown","1–10","11–50","51–200","201–500","500+"];
const CITIES = {
  "India": ["Bengaluru","Mumbai","Pune","Delhi NCR","Hyderabad","Chennai","Ahmedabad","Kochi","Coimbatore","Kolkata","Jaipur","Indore","Surat","Ludhiana"],
  "UAE": ["Dubai","Abu Dhabi","Sharjah","Ajman"],
  "Saudi Arabia": ["Riyadh","Jeddah","Dammam"],
  "Qatar": ["Doha"], "Oman": ["Muscat"], "Bahrain": ["Manama"], "Kuwait": ["Kuwait City"]
};
const INDUSTRIES = ["Manufacturing","Trading & distribution","Retail chains","Healthcare & clinics","Schools & coaching","Logistics & transport","Construction & real estate","Hotels & restaurants","IT & software services","Professional services","Security & facility services","Pharma & chemicals"];
const CHANNELS = [
  ["email","Email"],["linkedin","LinkedIn"],["whatsapp","WhatsApp"],["sequence","Follow-up sequence"],["call","Call script"],["objection","Answer an objection"]
];


/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const z = n => String(n).padStart(2, "0");
const dstr = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const fmtDate = s => s ? new Date(s + "T00:00:00").toLocaleDateString(undefined, {day:"numeric", month:"short"}) : "—";
const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const daysBetween = (a, b) => Math.round((new Date(b+"T00:00:00") - new Date(a+"T00:00:00")) / 86400000);
const ls = { get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
             set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const countryOf = city => { for (const [c, list] of Object.entries(CITIES)) if (list.includes(city)) return c; return "India"; };
const prodName = id => id === "both" ? "HR + Fin360" : (S.cfg.products.find(p => p.id === id)?.name || "—");
const prodChip = id => id ? `<span class="chip p-${esc(id)}">${esc(prodName(id))}</span>` : "";
const stageLabel = id => (STAGES.find(s => s[0] === id) || STAGES[0])[1];
const stageChip = id => `<span class="chip st-${esc(id || "new")}">${esc(stageLabel(id))}</span>`;
const isOpen = l => !["won","lost"].includes(l.stage);

function toast(msg){
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  $("#toastRoot").replaceChildren(t); setTimeout(() => t.remove(), 3200);
}
async function copyText(text, el){
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C or ⌘C to copy."); }
}


const errMsg = e => e?.message || "Something went wrong. Try again.";

/* ---------- API ---------- */
async function api(method, url, body){
  let r;
  try { r = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json", "x-cg": "1" }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw { status: 0, message: "Can't reach the server. Check your connection." }; }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.signedIn) { S.signedIn = false; showAuth("login", "Your session ended. Sign in again."); }
  if (!r.ok) throw { status: r.status, message: j.error || "Request failed." };
  return j;
}

/* ---------- state ---------- */
const S = {
  signedIn: false, me: null, pub: null, leadsMap: new Map(), leads: [], lastSync: 0, cfg: structuredClone(DEFAULT_CFG), my: {}, names: {}, team: [],
  pf: { stage: "open", mine: ls.get("drops.mine", false), q: "" }, find: { product: "hr", city: "Bengaluru", ind: "Manufacturing" },
  write: { channel: "email" }, tab: "today", prodDirty: false, dbState: "ready"
};
const canWrite = () => ["admin", "member"].includes(S.me?.role);
const isAdmin = () => S.me?.role === "admin";
Object.defineProperty(S, "uid", { get: () => S.me?.email || null });

/* ---------- tabs ---------- */
const TABS = ["today","extract","find","qualify","write","pipeline","products","team"];
function go(tab){
  if (!TABS.includes(tab) || (tab === "team" && !isAdmin())) tab = "today";
  const prevTab = S.tab; S.tab = tab;
  TABS.forEach(t => { $("#p-" + t).hidden = t !== tab; });
  $$(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  try { history.replaceState(null, "", "#" + tab); } catch {}
  $("#mePop").hidden = true;
  if (prevTab === "extract" && tab !== "extract") markExtractSeen();
  if (tab === "team") loadTeamAdmin();
  if (tab === "extract") { renderExtract(); paintXBadge(); }
  window.scrollTo(0, 0);
}
$$(".tab").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go);
  const a = e.target.closest("[data-add]"); if (a) openLead(null, {});
  if (!e.target.closest("#me")) $("#mePop").hidden = true;
});

/* ---------- people ---------- */
const COLORS = ["#0B7470","#4651B0","#A86A00","#1D7339","#8A3FA0","#B42318","#2F6FB0"];
function avatarHTML(email, name, picture){
  if (picture) return `<img class="avatar" alt="" src="${esc(picture)}" referrerpolicy="no-referrer">`;
  let h = 0; for (const c of email || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = (name || email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  return `<span class="avatar" style="background:${COLORS[h % COLORS.length]}">${esc(ini)}</span>`;
}
function paintOwner(el){
  const id = el.dataset.uid;
  if (!id) { el.innerHTML = `<span style="color:var(--muted)">Unassigned</span>`; return; }
  const t = S.names[id] || { name: id.split("@")[0] };
  el.innerHTML = `${avatarHTML(id, t.name, t.picture)}<span></span>`;
  el.querySelector("span:last-child").textContent = id === S.uid ? "You" : t.name;
}
const ownerCell = id => `<div class="owner" data-uid="${esc(id || "")}"></div>`;
function resolveNames(){}
async function loadTeam(){ try { const { team } = await api("GET", "/api/team"); S.team = team; S.names = Object.fromEntries(team.map(t => [t.email, t])); $$("[data-uid]").forEach(paintOwner); } catch {} }

/* ---------- TODAY ---------- */
function renderToday(){
  const now = new Date();
  $("#todayDate").textContent = now.toLocaleDateString(undefined, {weekday:"long", day:"numeric", month:"long"});
  const h = now.getHours(); const first = (S.me?.name || "").split(" ")[0];
  $("#greet").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}${first ? ", " + first : ""}`;
  const body = $("#todayBody");
  if (S.dbState !== "ready") { body.innerHTML = accessBlock(); return; }

  const t0 = startOfToday(), today = dstr();
  const mine = S.leads.filter(l => l.ownerId === S.uid);
  const added = S.leads.filter(l => l.createdBy === S.uid && (l.createdAt || 0) >= t0).length;
  const qual = S.leads.filter(l => l.qualifiedBy === S.uid && (l.qualifiedAt || 0) >= t0).length;
  const cont = S.leads.filter(l => l.contactedBy === S.uid && (l.contactedAt || 0) >= t0).length;
  const due = mine.filter(l => isOpen(l) && l.nextFollowUp && l.nextFollowUp <= today).sort((a,b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
  const tgt = (label, n, goal, hint) => { const pct = Math.min(100, Math.round(n / goal * 100));
    return `<div class="target"><span class="eyebrow">${label}</span><div class="num">${n}<small> / ${goal}</small></div><div class="bar ${n >= goal ? "done" : ""}"><i style="width:${pct}%"></i></div><span class="note">${hint}</span></div>`; };

  const counts = Object.fromEntries(STAGES.map(([k]) => [k, 0]));
  S.leads.forEach(l => counts[l.stage || "new"] = (counts[l.stage || "new"] || 0) + 1);
  const total = S.leads.length || 1;

  body.innerHTML = `
    <div class="panel">
      <div><h2 style="margin-bottom:10px">Your targets today</h2>
      <div class="targets">
        ${tgt("Companies found", added, 10, "Use Find leads, then log each good company.")}
        ${tgt("Qualified", qual, 5, "Run the best ones through Qualify.")}
        ${tgt("Contacted", cont, 10, "Write a message, send it, mark as contacted.")}
      </div></div>
      <div class="grid2">
        <div class="card">
          <div class="mhead" style="margin-bottom:6px"><h2>Follow-ups due</h2><span class="note mono">${due.length}</span></div>
          ${due.length ? `<div class="list">${due.map(l => { const d = daysBetween(l.nextFollowUp, today);
            return `<div class="item"><div style="min-width:0"><div class="co">${esc(l.company)}</div><div class="meta">${stageChip(l.stage)}${prodChip(l.product)}<span class="${d > 0 ? "due-over" : "due-today"}">${d > 0 ? d + (d === 1 ? " day overdue" : " days overdue") : "Due today"}</span></div></div>
            <div class="acts"><button class="btn small primary" data-write="${esc(l.id)}">Write</button><button class="btn small" data-snooze="${esc(l.id)}">+2 days</button><button class="btn small ghost" data-edit="${esc(l.id)}">Open</button></div></div>`; }).join("")}</div>`
          : `<div class="empty"><h3>Nothing due</h3><p>${mine.length ? "You're on top of your follow-ups." : "Leads you own show up here when a follow-up date arrives."}</p></div>`}
        </div>
        <div class="card">
          <div class="mhead" style="margin-bottom:12px"><h2>Team pipeline</h2><span class="note mono">${S.leads.length} leads</span></div>
          ${S.leads.length ? `<div class="funnel" role="img" aria-label="Leads by stage">${STAGES.filter(([k]) => counts[k]).map(([k]) => `<i style="width:${counts[k] / total * 100}%;background:${STAGE_COLOR[k]}"></i>`).join("")}</div>
          <div class="legend">${STAGES.map(([k, n]) => `<span><span class="dot" style="background:${STAGE_COLOR[k]}"></span>${n} <b>${counts[k]}</b></span>`).join("")}</div>`
          : `<div class="empty"><h3>No leads yet</h3><p>Start with Find leads. Each company you log lands here for the whole team.</p><button class="btn primary" data-go="find">Find leads</button></div>`}
        </div>
      </div>
    </div>`;
  resolveNames([]);
}
function accessBlock(){
  if (S.dbState === "loading") return `<div class="card"><div class="thinking"><span class="spin"></span>Connecting to your team's lead store…</div></div>`;
  return `<div class="card empty"><h3>Sign in to use the shared pipeline</h3><p>Sign in again to continue.</p></div>`;
}



/* ---------- FIND ---------- */
function buildFind(){
  $("#fProduct").innerHTML = `<button type="button" data-p="hr">${esc(prodName("hr"))}</button><button type="button" data-p="fin">${esc(prodName("fin"))}</button>`;
  $("#fCity").innerHTML = Object.entries(CITIES).map(([c, list]) =>
    `<optgroup label="${esc(c === "India" ? "India · priority" : c)}">${list.map(x => `<option>${esc(x)}</option>`).join("")}</optgroup>`).join("");
  $("#fInd").innerHTML = INDUSTRIES.map(x => `<option>${esc(x)}</option>`).join("");
  const saved = ls.get("drops.find", null); if (saved) Object.assign(S.find, saved);
  $("#fCity").value = S.find.city; $("#fInd").value = S.find.ind;
  $("#fProduct").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) { S.find.product = b.dataset.p; renderFind(); } });
  $("#fCity").addEventListener("change", e => { S.find.city = e.target.value; renderFind(); });
  $("#fInd").addEventListener("change", e => { S.find.ind = e.target.value; renderFind(); });
  renderFind();
}
function hookFor(country, product){
  const H = {
    India: { hr: ["Labour-law and payroll compliance", "Indian SMBs are adjusting to the new labour codes while keeping PF, ESI and attendance records straight. Clean attendance and HR records make an easy opener.", "labour codes compliance small business India"],
             fin: ["GST invoicing and e-way bills", "Businesses above the e-invoicing turnover limit must register invoices with the IRP, and every trader reconciles GST returns and stock. Fin360's tax-ready invoicing and live stock speak to this directly.", "GST e-invoicing small business"] },
    UAE: { hr: ["WPS payroll and Emiratisation", "Mainland UAE companies pay salaries through the Wage Protection System and many have Emiratisation targets. Accurate attendance and headcount data make both easier.", "UAE WPS Emiratisation SME"],
           fin: ["VAT and the UAE e-invoicing rollout", "UAE businesses file VAT and are preparing for mandatory e-invoicing. SMBs still on spreadsheets will need structured, compliant invoicing.", "UAE e-invoicing SMEs"] },
    "Saudi Arabia": { hr: ["Saudization, GOSI and Mudad", "Saudi employers manage Nitaqat quotas, GOSI contributions and Mudad payroll. Live headcount and attendance data help them stay inside the rules.", "Nitaqat Saudization SME"],
                      fin: ["ZATCA e-invoicing (Fatoorah)", "ZATCA brings businesses into e-invoicing integration in waves. SMBs reaching their wave need compliant invoicing quickly.", "ZATCA e-invoicing wave"] }
  };
  const gen = { hr: ["Wage protection and local hiring rules", `Employers in ${country} deal with wage protection payroll and nationalisation targets. Clean HR and attendance records reduce penalty risk.`, `${country} wage protection system SME`],
                fin: ["VAT compliance", `Businesses in ${country} must issue VAT-compliant invoices and keep audit-ready books. Spreadsheet billing becomes risky as they grow.`, `${country} VAT SME compliance`] };
  return (H[country] || gen)[product] || gen[product];
}
function renderFind(){
  ls.set("drops.find", S.find);
  $$("#fProduct [data-p]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === S.find.product)));
  const { product, city, ind } = S.find; const country = countryOf(city); const india = country === "India";
  const enc = encodeURIComponent;
  const g = q => "https://www.google.com/search?q=" + enc(q);
  const news = q => "https://www.google.com/search?tbm=nws&tbs=qdr:m&q=" + enc(q);
  const lij = k => `https://www.linkedin.com/jobs/search/?keywords=${enc(k)}&location=${enc(city + ", " + country)}&f_TPR=r604800`;
  const maps = q => "https://www.google.com/maps/search/" + enc(q);
  const roles = product === "hr" ? ["HR Executive","Payroll Executive","HR Generalist"] : ["Accountant","Accounts Executive","Inventory Executive"];
  const board = india ? "naukri.com" : "naukrigulf.com";
  const loc = india ? city : `${city} ${country}`;
  const indQ = ind.replace(/ & /g, " ");
  const hook = hookFor(country, product);
  const why = product === "hr"
    ? "A growing company adding HR or payroll staff is setting up HR processes right now. Reach the founder or the new hire's manager."
    : "A company hiring accountants or stock staff has more invoices, bills and inventory than its current tools handle.";
  const cards = [
    { k: "Hiring signal", t: `${indQ} companies hiring a ${roles[0]} in ${city}`, p: why,
      links: [["LinkedIn Jobs", lij(`${roles[0]} ${indQ}`)], [india ? "Naukri" : "Naukrigulf", g(`site:${board} "${roles[0]}" ${loc} ${indQ}`)], ...(india ? [] : [["Bayt", g(`site:bayt.com "${roles[0]}" ${loc}`)]]), [roles[1], lij(`${roles[1]} ${indQ}`)]] },
    { k: "Directory", t: `${ind} businesses in ${city}`, p: "Build a list of established local businesses. Look for 20–500 staff, several branches, and a website or listing with a phone number.",
      links: [["Google Maps", maps(`${indQ} companies in ${city}`)], india ? ["IndiaMART", g(`site:indiamart.com ${indQ} ${city}`)] : ["Business listings", g(`${indQ} company ${loc} LLC contact`)], ["LinkedIn companies", g(`site:linkedin.com/company ${indQ} ${loc} "11-50" OR "51-200" employees`)]] },
    { k: "Growth signal", t: `${indQ} companies expanding in ${city}`, p: "New branches, plants, warehouses or funding mean more staff, more transactions and a budget for new systems. These are your warmest cold leads.",
      links: [["News: expansion", news(`${loc} ${indQ} company "new branch" OR expansion OR "new plant" OR "new warehouse"`)], ["News: funding", news(`${loc} ${indQ} startup raises funding`)], ["New listings", g(`${indQ} ${loc} "now open" OR "newly opened"`)]] },
    { k: "Intent signal", t: `People in ${city} asking for ${product === "hr" ? "HR or attendance software" : "billing or inventory software"}`, p: "Posts and threads where owners describe the exact problem you solve. Reply helpfully first, pitch second.",
      links: product === "hr"
        ? [["LinkedIn posts", g(`site:linkedin.com/posts ${loc} "HRMS" OR "attendance software" OR "payroll software" recommend`)], ["Forums", g(`"${city}" "HR software" OR "attendance app" suggest small company`)], ["Tenders / RFQs", g(`${loc} RFQ OR tender "HRMS" OR "biometric attendance"`)]]
        : [["LinkedIn posts", g(`site:linkedin.com/posts ${loc} "inventory software" OR "billing software" OR "accounting software" recommend`)], ["Forums", g(`"${city}" "billing software" OR "inventory software" suggest small business`)], ["Tenders / RFQs", g(`${loc} RFQ OR tender "ERP" OR "inventory software"`)]] },
    { k: "Why now", hook: true, t: hook[0], p: hook[1], links: [["Latest news", news(hook[2])]], note: "Check the current rules before quoting them to a customer." }
  ];
  $("#sigs").innerHTML = cards.map((c, i) => `
    <article class="sig">
      <div class="k ${c.hook ? "hook" : ""}">${esc(c.k)}</div>
      <h3>${esc(c.t)}</h3>
      <p>${esc(c.p)}</p>
      <div class="links">${c.links.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join("")}</div>
      <div class="foot">${c.note ? `<span class="note">${esc(c.note)}</span>` : `<span class="note">Opens in a new tab</span>`}${c.hook ? "" : `<button class="btn small" data-log="${i}">Log a company</button>`}</div>
    </article>`).join("");
  $$("#sigs [data-log]").forEach(b => b.addEventListener("click", () => {
    const c = cards[+b.dataset.log];
    openLead(null, { city, country, industry: ind, product, signal: c.k + ": " + c.t });
  }));
}



/* ---------- lead modal ---------- */
function opt(list, val){ return list.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join(""); }
function openLead(id, prefill){
  if (S.dbState !== "ready") { toast("Sign in to save leads to the shared pipeline."); return; }
  const l = id ? S.leadsMap.get(id) : null;
  const v = Object.assign({ stage: "new", product: "hr", size: "Unknown", country: "India", nextFollowUp: "" }, l || {}, prefill || {});
  const ro = !canWrite();
  const prodOpts = [["hr", prodName("hr")], ["fin", prodName("fin")], ["both", "Both"]];
  $("#modalRoot").innerHTML = `
  <div class="scrim" id="scrim"><form class="modal" id="leadForm" role="dialog" aria-modal="true" aria-labelledby="lfTitle">
    <div class="mhead"><h2 id="lfTitle">${l ? esc(l.company) : "Add a lead"}</h2><button type="button" class="btn ghost small" data-close>Close</button></div>
    ${ro ? `<div class="banner">You have view-only access to this desk.</div>` : ""}
    <div id="dupWarn" hidden class="banner"></div>
    <div class="fgrid">
      <div class="field wide"><label for="lf-company">Company *</label><input type="text" id="lf-company" required value="${esc(v.company)}"></div>
      <div class="field"><label for="lf-contactName">Contact name</label><input type="text" id="lf-contactName" value="${esc(v.contactName)}"></div>
      <div class="field"><label for="lf-contactRole">Contact role</label><input type="text" id="lf-contactRole" value="${esc(v.contactRole)}" placeholder="Founder, HR Manager…"></div>
      <div class="field"><label for="lf-email">Email</label><input type="email" id="lf-email" value="${esc(v.email)}"></div>
      <div class="field"><label for="lf-phone">Phone / WhatsApp</label><input type="tel" id="lf-phone" value="${esc(v.phone)}"></div>
      <div class="field"><label for="lf-website">Website or LinkedIn</label><input type="text" id="lf-website" value="${esc(v.website)}"></div>
      <div class="field"><label for="lf-city">City</label><input type="text" id="lf-city" value="${esc(v.city)}"></div>
      <div class="field"><label for="lf-country">Country</label><select id="lf-country">${opt(Object.keys(CITIES).concat(["Other"]).map(c => [c, c]), v.country)}</select></div>
      <div class="field"><label for="lf-industry">Industry</label><input type="text" id="lf-industry" value="${esc(v.industry)}"></div>
      <div class="field"><label for="lf-size">Employees</label><select id="lf-size">${opt(SIZES.map(s => [s, s]), v.size)}</select></div>
      <div class="field"><label for="lf-product">Product</label><select id="lf-product">${opt(prodOpts, v.product)}</select></div>
      <div class="field"><label for="lf-stage">Stage</label><select id="lf-stage">${opt(STAGES, v.stage)}</select></div>
      <div class="field"><label for="lf-next">Next follow-up</label><input type="date" id="lf-next" value="${esc(v.nextFollowUp)}"></div>
      <div class="field wide"><label for="lf-signal">Why this lead</label><input type="text" id="lf-signal" value="${esc(v.signal)}" placeholder="e.g. Hiring 2 accountants on Naukri this week"></div>
      <div class="field wide"><label for="lf-notes">Notes</label><textarea id="lf-notes" rows="4">${esc(v.notes)}</textarea></div>
    </div>
    ${l?.brief ? `<div class="note">Qualified ${l.qualifiedAt ? new Date(l.qualifiedAt).toLocaleDateString() : ""}: ${esc(l.brief.summary || "")}</div>` : ""}
    <div class="mfoot">
      <div class="row" style="gap:8px">${l && !ro ? `<button type="button" class="btn danger small" id="lfDel">Delete</button>` : ""}${l && l.ownerId !== S.uid && !ro ? `<button type="button" class="btn small" id="lfTake">Assign to me</button>` : ""}</div>
      <div class="row" style="gap:8px">${l ? `<button type="button" class="btn" id="lfQual">Qualify</button><button type="button" class="btn" id="lfWrite">Write</button>` : ""}<button type="submit" class="btn primary" ${ro ? "disabled" : ""}>${l ? "Save" : "Add to pipeline"}</button></div>
    </div>
  </form></div>`;
  const close = () => { $("#modalRoot").innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  $("#scrim").addEventListener("click", e => { if (e.target.id === "scrim" || e.target.closest("[data-close]")) close(); });
  $("#lf-company").focus();
  const dupCheck = () => {
    const name = $("#lf-company").value.trim().toLowerCase(); const w = $("#dupWarn");
    const d = name && S.leads.find(x => x.id !== id && (x.company || "").trim().toLowerCase() === name);
    w.hidden = !d; if (d) w.textContent = `${d.company} is already in the pipeline (${stageLabel(d.stage)}, owner: ${d.ownerId === S.uid ? "you" : (S.names[d.ownerId]?.name || "a teammate")}).`;
  };
  $("#lf-company").addEventListener("input", dupCheck); dupCheck();
  $("#leadForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = k => $("#lf-" + k).value.trim();
    const data = { company: f("company"), contactName: f("contactName"), contactRole: f("contactRole"), email: f("email"), phone: f("phone"), website: f("website"),
      city: f("city"), country: $("#lf-country").value, industry: f("industry"), size: $("#lf-size").value, product: $("#lf-product").value,
      stage: $("#lf-stage").value, nextFollowUp: $("#lf-next").value, signal: f("signal"), notes: $("#lf-notes").value };
    if (!data.company) return;
    if (data.stage === "contacted" && !(l && l.contactedAt)) { data.contactedAt = Date.now(); data.contactedBy = S.uid; }
    if (!l && !data.nextFollowUp && data.stage === "new") data.nextFollowUp = addDays(1);
    try { const nid = await saveLead(id, data); close(); toast(l ? "Saved" : "Added to pipeline"); if (!l) S.lastAdded = nid; }
    catch (err) { toast(errMsg(err)); }
  });
  if (l) {
    $("#lfQual").onclick = () => { close(); loadQualify(l.id); go("qualify"); };
    $("#lfWrite").onclick = () => { close(); $("#wLead").value = l.id; go("write"); };
    const del = $("#lfDel");
    if (del) del.onclick = async () => {
      if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Click again to delete"; return; }
      try { await deleteLead(l.id); close(); toast("Lead deleted"); } catch (err) { toast(errMsg(err)); }
    };
    const take = $("#lfTake");
    if (take) take.onclick = async () => { try { await saveLead(l.id, { ownerId: S.uid }); close(); toast("Assigned to you"); } catch (err) { toast(errMsg(err)); } };
  }
}

async function saveLead(id, data){
  const r = id ? await api("PATCH", "/api/leads/" + encodeURIComponent(id), data) : await api("POST", "/api/leads", data);
  mergeLeads([r.lead]); return r.lead.id;
}
async function deleteLead(id){ await api("DELETE", "/api/leads/" + encodeURIComponent(id)); S.leadsMap.delete(id); afterLeads(); }
document.addEventListener("click", async e => {
  const w = e.target.closest("[data-write]"); if (w) { $("#wLead").value = w.dataset.write; syncWriteProd(); go("write"); }
  const ed = e.target.closest("[data-edit]"); if (ed) openLead(ed.dataset.edit);
  const sn = e.target.closest("[data-snooze]");
  if (sn) { try { await saveLead(sn.dataset.snooze, { nextFollowUp: addDays(2) }); toast("Moved to " + fmtDate(addDays(2))); } catch (err) { toast(errMsg(err)); } }
});

/* ---------- PIPELINE ---------- */
function buildPipeline(){
  $("#pSearch").addEventListener("input", e => { S.pf.q = e.target.value.trim().toLowerCase(); renderPipeline(); });
  $("#pMine").addEventListener("click", () => { S.pf.mine = !S.pf.mine; ls.set("drops.mine", S.pf.mine); renderPipeline(); });
  $("#pStages").addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (b) { S.pf.stage = b.dataset.st; renderPipeline(); } });
  $("#pipeList").addEventListener("change", async e => {
    const s = e.target.closest("select[data-stage]"); if (!s) return;
    const l = S.leads.find(x => x.id === s.dataset.stage); const patch = { stage: s.value };
    if (s.value === "contacted" && !l?.contactedAt) { patch.contactedAt = Date.now(); patch.contactedBy = S.uid; patch.nextFollowUp = addDays(3); }
    if (["won","lost"].includes(s.value)) patch.nextFollowUp = "";
    try { await saveLead(s.dataset.stage, patch); toast("Moved to " + stageLabel(s.value)); } catch (err) { toast(errMsg(err)); renderPipeline(); }
  });
  $("#exportCsv").addEventListener("click", exportCsv); $("#exportCsv").hidden = false;
}
function renderPipeline(){
  const box = $("#pipeList");
  $("#pMine").setAttribute("aria-pressed", String(S.pf.mine));
  if (S.dbState !== "ready") { box.innerHTML = accessBlock(); $("#pStages").innerHTML = ""; return; }
  const base = S.leads.filter(l => !S.pf.mine || l.ownerId === S.uid);
  const cnt = k => k === "all" ? base.length : k === "open" ? base.filter(isOpen).length : base.filter(l => (l.stage || "new") === k).length;
  $("#pStages").innerHTML = [["open","Open"],["all","All"], ...STAGES].map(([k, n]) =>
    `<button class="fchip" data-st="${k}" aria-pressed="${S.pf.stage === k}">${esc(n)}<span class="mono">${cnt(k)}</span></button>`).join("");
  const today = dstr(); const q = S.pf.q;
  const rows = base.filter(l => S.pf.stage === "all" ? true : S.pf.stage === "open" ? isOpen(l) : (l.stage || "new") === S.pf.stage)
    .filter(l => !q || [l.company, l.city, l.contactName, l.industry, l.country].some(x => (x || "").toLowerCase().includes(q)))
    .sort((a, b) => (a.nextFollowUp || "9999").localeCompare(b.nextFollowUp || "9999") || (b.updatedAt || 0) - (a.updatedAt || 0));
  $("#pipeSub").textContent = `${S.leads.length} ${S.leads.length === 1 ? "company" : "companies"} across the team · ${S.leads.filter(l => l.stage === "won").length} won`;
  if (!S.leads.length) { box.innerHTML = `<div class="empty"><h3>Your pipeline is empty</h3><p>Log companies from Find leads, or add one you already know. Everyone on the team sees the same list.</p><div class="row" style="justify-content:center"><button class="btn" data-go="find">Find leads</button><button class="btn primary" data-add>Add a lead</button></div></div>`; return; }
  if (!rows.length) { box.innerHTML = `<div class="empty"><h3>No matches</h3><p>Try another stage or clear the search.</p></div>`; return; }
  const ro = !canWrite();
  box.innerHTML = `<div class="prow hd"><span>Company</span><span>Product</span><span>Stage</span><span>Owner</span><span>Follow-up</span><span></span></div>` +
    rows.map(l => { const d = l.nextFollowUp && isOpen(l) ? daysBetween(l.nextFollowUp, today) : null;
      const cls = d === null ? "" : d > 0 ? "due-over" : d === 0 ? "due-today" : "";
      return `<div class="prow">
        <div class="c-co" style="min-width:0"><div class="co" style="font-weight:600">${esc(l.company)}</div><div class="meta">${esc([l.city, l.country].filter(Boolean).join(", "))}${l.industry ? " · " + esc(l.industry) : ""}${l.contactName ? " · " + esc(l.contactName) : ""}${typeof l.fit === "number" ? ` · <span class="mono">fit ${l.fit}</span>` : ""}</div></div>
        <div class="c-pr">${prodChip(l.product)}</div>
        <div class="c-st"><label class="sr" for="st-${esc(l.id)}">Stage</label><select id="st-${esc(l.id)}" data-stage="${esc(l.id)}" ${ro ? "disabled" : ""}>${opt(STAGES, l.stage || "new")}</select></div>
        <div class="c-ow">${ownerCell(l.ownerId)}</div>
        <div class="c-fu mono ${cls}" style="font-size:.85rem">${l.nextFollowUp && isOpen(l) ? fmtDate(l.nextFollowUp) : "—"}</div>
        <div class="c-ac acts"><button class="btn small ghost" data-write="${esc(l.id)}">Write</button><button class="btn small" data-edit="${esc(l.id)}">Open</button></div>
      </div>`; }).join("");
  $$("#pipeList [data-uid]").forEach(paintOwner);
  resolveNames(rows.map(r => r.ownerId));
}

function exportCsv(){
  const cols = ["company","contactName","contactRole","email","phone","website","city","country","industry","size","product","stage","nextFollowUp","fit","ownerId","signal","notes"];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.join(","), ...S.leads.map(l => cols.map(c => q(l[c])).join(","))].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `drops-pipeline-${dstr()}.csv`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- QUALIFY ---------- */
let qCtl = null;
function buildQualify(){
  $("#qSize").innerHTML = SIZES.map(s => `<option>${esc(s)}</option>`).join("");
  $("#qLead").addEventListener("change", e => loadQualify(e.target.value));
  $("#qGo").addEventListener("click", runQualify);
  $("#qStop").addEventListener("click", () => qCtl?.abort());
  qIdle();
}
function qIdle(){
  $("#qOut").innerHTML = `<div class="empty" style="padding:24px 8px"><h3>Your brief appears here</h3><p>A fit score for ${esc(prodName("hr"))} and ${esc(prodName("fin"))}, likely pains, who to contact, a first line and discovery questions.</p></div>`;
}
function loadQualify(id){
  $("#qLead").value = id || "";
  const l = S.leadsMap.get(id);
  if (!l) return;
  $("#qCompany").value = l.company || ""; $("#qCity").value = [l.city, l.country].filter(Boolean).join(", ");
  $("#qInd").value = l.industry || ""; $("#qSize").value = l.size || "Unknown";
  $("#qText").value = [l.signal && "Signal: " + l.signal, l.website && "Website: " + l.website, l.notes].filter(Boolean).join("\n");
  if (l.brief) renderBrief(l.brief, l.id); else qIdle();
}

async function runQualify(){
  const company = $("#qCompany").value.trim();
  if (!company) { toast("Add a company name first."); $("#qCompany").focus(); return; }
  if (!canWrite()) { toast("Viewers can't use AI features."); return; }
  qCtl = new AbortController();
  $("#qGo").disabled = true; $("#qStop").hidden = false;
  $("#qOut").innerHTML = `<div class="thinking"><span class="spin"></span>Reading what you found and scoring the fit…</div>`;
  try {
    const r = await fetch("/api/ai/qualify", { method: "POST", signal: qCtl.signal, credentials: "same-origin", headers: { "content-type": "application/json", "x-cg": "1" },
      body: JSON.stringify({ company, location: $("#qCity").value.trim(), industry: $("#qInd").value.trim(), size: $("#qSize").value, text: $("#qText").value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { message: j.error };
    renderBrief(j.brief, $("#qLead").value || null);
  } catch (e) {
    if (e?.name === "AbortError") qIdle(); else $("#qOut").innerHTML = `<div class="banner bad">${esc(errMsg(e))}</div>`;
  } finally { $("#qGo").disabled = false; $("#qStop").hidden = true; }
}
const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
function renderBrief(b, leadId){
  const sec = (t, list) => list?.length ? `<div class="qsec"><span class="eyebrow">${t}</span><ul class="blist">${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const rec = b.recommended === "none" ? "Not a fit yet" : "Lead with " + prodName(b.recommended);
  $("#qOut").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="mhead"><h2>${esc(rec)}</h2>${b.recommended !== "none" ? prodChip(b.recommended) : ""}</div>
      <p style="color:var(--muted)">${esc(b.summary)}</p>
      <div class="fit">
        <span>${esc(prodName("hr"))}</span><div class="bar hrb"><i style="width:${clamp(b.fit?.hr)}%"></i></div><span class="mono">${clamp(b.fit?.hr)}</span>
        <span>${esc(prodName("fin"))}</span><div class="bar"><i style="width:${clamp(b.fit?.fin)}%"></i></div><span class="mono">${clamp(b.fit?.fin)}</span>
      </div>
      ${sec("Why", b.why)}
      ${b.opener ? `<div class="qsec"><span class="eyebrow">Opening line</span><div class="opener" dir="auto">${esc(b.opener)}</div></div>` : ""}
      ${sec("Likely pains", b.pains)}${sec("Who to contact", b.contacts)}${sec("Ask on the call", b.questions)}${sec("Verify before pitching", b.unknowns)}
      ${canWrite() ? `<div class="row"><button class="btn primary" id="qSave">${leadId ? "Save brief to lead" : "Add to pipeline with brief"}</button>${leadId ? `<button class="btn" id="qWrite">Write outreach</button>` : ""}</div>` : ""}
    </div>`;
  const save = $("#qSave");
  if (save) save.onclick = async () => {
    const patch = { brief: b }; if (b.recommended !== "none") patch.product = b.recommended;
    try {
      if (leadId) { await saveLead(leadId, patch); toast("Brief saved to lead"); }
      else {
        const [city, country] = $("#qCity").value.split(",").map(s => s.trim());
        const nid = await saveLead(null, { company: $("#qCompany").value.trim(), city: city || "", country: country || (city ? countryOf(city) : "India"), industry: $("#qInd").value.trim(),
          size: $("#qSize").value, notes: $("#qText").value, stage: "new", nextFollowUp: addDays(1), product: patch.product || "hr", brief: b });
        refreshLeadSelects(); $("#qLead").value = nid; renderBrief(b, nid); toast("Added to pipeline");
      }
    } catch (err) { toast(errMsg(err)); }
  };
  const w = $("#qWrite"); if (w) w.onclick = () => { $("#wLead").value = leadId; syncWriteProd(); go("write"); };
}

/* ---------- WRITE ---------- */
let wCtl = null;
function buildWrite(){
  $("#wChannel").innerHTML = CHANNELS.map(([k, n]) => `<button type="button" data-ch="${k}">${esc(n)}</button>`).join("");
  $("#wChannel").addEventListener("click", e => { const b = e.target.closest("[data-ch]"); if (b) { S.write.channel = b.dataset.ch; paintChannel(); } });
  $("#wProd").innerHTML = `<option value="auto">Best fit</option><option value="hr">${esc(prodName("hr"))}</option><option value="fin">${esc(prodName("fin"))}</option><option value="both">Both</option>`;
  $("#wLead").addEventListener("change", syncWriteProd);
  $("#wGo").addEventListener("click", () => runWrite(false));
  $("#wAgain").addEventListener("click", () => runWrite(true));
  $("#wStop").addEventListener("click", () => wCtl?.abort());
  $("#wCopy").addEventListener("click", () => copyText($("#wOut").textContent, $("#wOut")));
  $("#wLogged").addEventListener("click", async () => {
    const id = $("#wLead").value; if (!id) return;
    const l = S.leadsMap.get(id);
    const patch = { nextFollowUp: addDays(3), markContacted: true, lastChannel: S.write.channel };
    try { await saveLead(id, patch); toast("Logged. Follow-up set for " + fmtDate(addDays(3))); $("#wAfter").hidden = true; } catch (err) { toast(errMsg(err)); }
  });
  paintChannel(); wIdle();
}
function wIdle(){ $("#wOut").innerHTML = `<div class="empty" style="padding:24px 8px"><h3>Pick a lead and a channel</h3><p>Your draft streams in here. Edit it in your email or WhatsApp before sending.</p></div>`; }
function paintChannel(){
  $$("#wChannel [data-ch]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ch === S.write.channel)));
  const obj = S.write.channel === "objection";
  $("#wExtraLbl").textContent = obj ? "What did they say?" : "Anything to include";
  $("#wExtra").placeholder = obj ? "e.g. We already use Tally and Excel, it works fine." : "e.g. Met them at the Pune MSME expo. Mention we can demo in Marathi.";
}
function syncWriteProd(){ const l = S.leads.find(x => x.id === $("#wLead").value); $("#wProd").value = l?.product || "auto"; }

async function runWrite(again){
  const id = $("#wLead").value;
  if (!S.leadsMap.has(id)) { toast("Choose a lead first. Add one in Pipeline if needed."); $("#wLead").focus(); return; }
  if (!canWrite()) { toast("Viewers can't use AI features."); return; }
  const ch = S.write.channel, extra = $("#wExtra").value.trim();
  if (ch === "objection" && !extra) { toast("Type what the prospect said."); $("#wExtra").focus(); return; }
  wCtl = new AbortController();
  $("#wGo").disabled = true; $("#wAgain").disabled = true; $("#wCopy").disabled = true; $("#wStop").hidden = false; $("#wAfter").hidden = true;
  $("#wOut").innerHTML = `<div class="thinking"><span class="spin"></span>Writing your ${esc(CHANNELS.find(c => c[0] === ch)[1].toLowerCase())}…</div>`;
  let text = "";
  try {
    const r = await fetch("/api/ai/write", { method: "POST", signal: wCtl.signal, credentials: "same-origin", headers: { "content-type": "application/json", "x-cg": "1" },
      body: JSON.stringify({ leadId: id, channel: ch, lang: $("#wLang").value, tone: $("#wTone").value, product: $("#wProd").value, extra }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw { message: j.error }; }
    const reader = r.body.getReader(); const dec = new TextDecoder();
    for (;;) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); $("#wOut").textContent = text; }
    if (!text.trim()) throw { message: "The AI returned nothing. Try again with more detail." };
    $("#wCopy").disabled = false; $("#wAfter").hidden = !canWrite();
  } catch (e) {
    if (e?.name === "AbortError") { if (!text) wIdle(); else $("#wCopy").disabled = false; }
    else if (text) { $("#wCopy").disabled = false; toast(errMsg(e)); }
    else $("#wOut").innerHTML = `<div class="banner bad">${esc(errMsg(e))}</div>`;
  } finally { $("#wGo").disabled = false; $("#wAgain").disabled = false; $("#wStop").hidden = true; }
}

/* ---------- lead selects ---------- */
function refreshLeadSelects(){
  const sorted = [...S.leads].sort((a, b) => (a.company || "").localeCompare(b.company || ""));
  const mineFirst = [...sorted.filter(l => l.ownerId === S.uid), ...sorted.filter(l => l.ownerId !== S.uid)];
  const opts = mineFirst.map(l => `<option value="${esc(l.id)}">${esc(l.company)}${l.city ? " · " + esc(l.city) : ""}</option>`).join("");
  for (const [sel, empty] of [["#qLead", "New company (not in pipeline yet)"], ["#wLead", S.leads.length ? "Choose a lead…" : "No leads yet. Add one in Pipeline."]]) {
    const el = $(sel); const v = el.value; el.innerHTML = `<option value="">${empty}</option>` + opts;
    if (v && S.leads.some(l => l.id === v)) el.value = v;
  }
}



/* ---------- PRODUCTS & ME ---------- */
function renderProducts(){
  if (S.prodDirty) return;
  const admin = isAdmin();
  $("#prodBody").innerHTML = S.cfg.products.map((p, i) => `
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="mhead"><h2>${esc(p.name)}</h2>${prodChip(p.id)}</div>
      ${admin ? `
      <div class="field"><label for="pp-name-${i}">Product name</label><input type="text" id="pp-name-${i}" data-pp="${i}.name" value="${esc(p.name)}"></div>
      <div class="field"><label for="pp-one-${i}">One-line pitch</label><input type="text" id="pp-one-${i}" data-pp="${i}.oneLiner" value="${esc(p.oneLiner)}"></div>
      <div class="field"><label for="pp-icp-${i}">Ideal customer</label><textarea id="pp-icp-${i}" rows="3" data-pp="${i}.idealCustomer">${esc(p.idealCustomer)}</textarea></div>
      <div class="field"><label for="pp-desc-${i}">Features the AI may mention</label><textarea id="pp-desc-${i}" rows="10" data-pp="${i}.description">${esc(p.description)}</textarea></div>`
      : `<p>${esc(p.oneLiner)}</p><div class="qsec"><span class="eyebrow">Ideal customer</span><p>${esc(p.idealCustomer)}</p></div><div class="qsec"><span class="eyebrow">Features</span><p style="white-space:pre-wrap;color:var(--muted);font-size:.9rem">${esc(p.description)}</p></div>`}
    </div>`).join("") + (admin ? `<div class="card" style="display:flex;flex-direction:column;gap:12px">
      <h2>Company</h2>
      <div class="field"><label for="pp-co">Company name</label><input type="text" id="pp-co" data-pp="co.name" value="${esc(S.cfg.company.name)}"></div>
      <div class="field"><label for="pp-pitch">Company pitch</label><textarea id="pp-pitch" rows="3" data-pp="co.pitch">${esc(S.cfg.company.pitch)}</textarea></div>
      <div class="field"><label for="pp-off">What we offer (used for Extract messages)</label><textarea id="pp-off" rows="5" data-pp="co.offerings">${esc(S.cfg.company.offerings || "")}</textarea></div>
      <div class="row"><button class="btn primary" id="ppSave">Save product details</button></div></div>` : "");
  $$("#prodBody [data-pp]").forEach(el => el.addEventListener("input", () => { S.prodDirty = true; }));
  const sv = $("#ppSave");
  if (sv) sv.onclick = async () => {
    const cfg = structuredClone(S.cfg);
    $$("#prodBody [data-pp]").forEach(el => { const [a, k] = el.dataset.pp.split("."); if (a === "co") cfg.company[k] = el.value.trim(); else cfg.products[+a][k] = el.value.trim(); });
    try { const r = await api("PUT", "/api/config", { config: cfg }); S.cfg = r.config; S.prodDirty = false; onCfg(); toast("Product details saved for the team"); }
    catch (err) { toast(errMsg(err)); }
  };
}
function buildMe(){
  $("#mySave").addEventListener("click", async () => {
    const my = { name: $("#myName").value.trim(), title: $("#myTitle").value.trim(), phone: $("#myPhone").value.trim(), link: $("#myLink").value.trim() };
    try { const r = await api("PUT", "/api/me/settings", my); S.my = r.settings; toast("Saved"); } catch (err) { toast(errMsg(err)); }
  });
  $("#pwSave").addEventListener("click", async () => {
    const msg = $("#pwMsg"); msg.className = "note"; msg.textContent = "";
    try {
      await api("POST", "/api/auth/password", { current: $("#pwCur").value, password: $("#pwNew").value });
      $("#pwCur").value = ""; $("#pwNew").value = ""; $("#pwForce").hidden = true; $("#pwCurWrap").hidden = false; S.me.hasPassword = true;
      msg.className = "ok"; msg.textContent = "Password changed.";
    } catch (err) { msg.className = "err"; msg.textContent = errMsg(err); }
  });
}
function paintMe(){
  $("#myName").value = S.my.name || S.me?.name || ""; $("#myTitle").value = S.my.title || ""; $("#myPhone").value = S.my.phone || ""; $("#myLink").value = S.my.link || "";
  $("#pwCurWrap").hidden = !S.me?.hasPassword || !!S.me?.mustChangePassword;
  $("#pwForce").hidden = !S.me?.mustChangePassword;
}

/* ---------- TEAM (admin) ---------- */
async function loadTeamAdmin(){
  $("#salesTeam").value = (S.cfg.salesTeam || []).join("\n");
  const box = $("#teamList");
  box.innerHTML = `<div class="empty"><div class="thinking"><span class="spin"></span>Loading team…</div></div>`;
  try { const { users } = await api("GET", "/api/admin/users"); renderTeamAdmin(users); }
  catch (err) { box.innerHTML = `<div class="banner bad">${esc(errMsg(err))}</div>`; }
}
function renderTeamAdmin(users){
  const order = { pending: 0, active: 1, disabled: 2 };
  users.sort((a, b) => order[a.status] - order[b.status] || (b.createdAt || 0) - (a.createdAt || 0));
  const pending = users.filter(u => u.status === "pending").length;
  const pb = $("#pendingBadge"); pb.hidden = !pending; pb.textContent = pending;
  $("#teamList").innerHTML = users.map(u => `
    <div class="urow">
      <div class="owner" style="font-size:.95rem">${avatarHTML(u.email, u.name, u.picture)}<div style="min-width:0"><div style="font-weight:600" class="u-name"></div><div class="note u-mail"></div></div></div>
      <div><span class="chip ${u.status === "pending" ? "pending" : u.status === "active" ? "active-s" : "disabled-s"}">${u.status === "pending" ? "Waiting for approval" : u.status === "active" ? "Active" : "Disabled"}</span>
        <div class="note">${u.provider === "google" ? "Google" : "Password"} · joined ${u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}</div></div>
      <div><label class="sr" for="role-${esc(u.email)}">Role</label><select id="role-${esc(u.email)}" data-role="${esc(u.email)}" ${u.email === S.uid ? "disabled" : ""}>${opt([["member","Member"],["viewer","Viewer"],["admin","Admin"]], u.role)}</select></div>
      <div class="acts">
        ${u.status === "pending" ? `<button class="btn small primary" data-ustatus="active" data-u="${esc(u.email)}">Approve</button><button class="btn small" data-ustatus="disabled" data-u="${esc(u.email)}">Reject</button>` : ""}
        ${u.status === "active" && u.email !== S.uid ? `<button class="btn small ghost" data-ustatus="disabled" data-u="${esc(u.email)}">Disable</button>` : ""}
        ${u.status === "disabled" ? `<button class="btn small" data-ustatus="active" data-u="${esc(u.email)}">Re-enable</button>` : ""}
        ${u.provider !== "google" && u.status === "active" ? `<button class="btn small ghost" data-reset="${esc(u.email)}">Reset password</button>` : ""}
      </div>
    </div>`).join("") || `<div class="empty"><h3>No one yet</h3></div>`;
  $$("#teamList .urow").forEach((row, i) => { row.querySelector(".u-name").textContent = users[i].name; row.querySelector(".u-mail").textContent = users[i].email; });
}
function buildTeamAdmin(){
  $("#salesTeamSave").addEventListener("click", async () => {
    const names = $("#salesTeam").value.split("\n").map(s => s.trim()).filter(Boolean);
    try { const r = await api("PUT", "/api/config/sales-team", { names }); S.cfg.salesTeam = r.salesTeam; $("#salesTeam").value = r.salesTeam.join("\n"); toast("Sales team names saved"); renderExtract(true); }
    catch (err) { toast(errMsg(err)); }
  });
  $("#teamList").addEventListener("click", async e => {
    const s = e.target.closest("[data-ustatus]");
    if (s) { try { await api("PATCH", "/api/admin/users/" + encodeURIComponent(s.dataset.u), { status: s.dataset.ustatus }); toast(s.dataset.ustatus === "active" ? "Access granted" : "Access removed"); loadTeamAdmin(); loadTeam(); } catch (err) { toast(errMsg(err)); } }
    const r = e.target.closest("[data-reset]");
    if (r) {
      if (r.dataset.armed !== "1") { r.dataset.armed = "1"; r.textContent = "Click again to reset"; return; }
      try {
        const { tempPassword } = await api("POST", "/api/admin/users/" + encodeURIComponent(r.dataset.reset) + "/reset-password");
        const wrap = r.closest(".acts"); wrap.innerHTML = `<span class="note">Temporary password:</span> <span class="temp"></span>`; wrap.querySelector(".temp").textContent = tempPassword;
        toast("Share this password with them privately. They'll be asked to change it.");
      } catch (err) { toast(errMsg(err)); }
    }
  });
  $("#teamList").addEventListener("change", async e => {
    const s = e.target.closest("[data-role]"); if (!s) return;
    try { await api("PATCH", "/api/admin/users/" + encodeURIComponent(s.dataset.role), { role: s.value }); toast("Role updated"); loadTeam(); } catch (err) { toast(errMsg(err)); loadTeamAdmin(); }
  });
}

/* ---------- live updates ---------- */
function mergeLeads(list){
  for (const l of list) { if (l.deleted) S.leadsMap.delete(l.id); else S.leadsMap.set(l.id, l); }
  afterLeads();
}
function afterLeads(){
  S.leads = [...S.leadsMap.values()];
  renderToday(); renderPipeline(); refreshLeadSelects();
  const due = S.leads.filter(l => l.ownerId === S.uid && isOpen(l) && l.nextFollowUp && l.nextFollowUp <= dstr()).length;
  const badge = $("#dueBadge"); badge.hidden = !due; badge.textContent = due;
}
async function syncLeads(full){
  try {
    const r = await api("GET", "/api/leads" + (full || !S.lastSync ? "" : "?since=" + (S.lastSync - 15000)));
    if (full || !S.lastSync) S.leadsMap = new Map();
    S.lastSync = r.serverTime; mergeLeads(r.leads);
  } catch {}
}
function onCfg(){
  buildFindProductButtons(); renderFind(); renderProducts();
  $("#wProd").innerHTML = `<option value="auto">Best fit</option><option value="hr">${esc(prodName("hr"))}</option><option value="fin">${esc(prodName("fin"))}</option><option value="both">Both</option>`;
  syncWriteProd(); renderPipeline(); renderToday();
}
function buildFindProductButtons(){
  $("#fProduct").innerHTML = `<button type="button" data-p="hr">${esc(prodName("hr"))}</button><button type="button" data-p="fin">${esc(prodName("fin"))}</button>`;
}

/* ---------- EXTRACT ---------- */
const X_FILTERS_EMPTY = { intent: "all", q: "", country: "all", vmin: "", vmax: "", added: "all", req: "", who: "", contact: "all", source: "all", assigned: "all", remarks: "all", status: "all" };
// Approximate USD rates, only for the value filter. Edit if you need different rates.
const USD_RATES = { USD: 1, INR: 0.012, AED: 0.272, SAR: 0.267, QAR: 0.275, OMR: 2.6, BHD: 2.65, KWD: 3.25, EUR: 1.08, GBP: 1.27, AUD: 0.66, CAD: 0.73, SGD: 0.74, PKR: 0.0036, BDT: 0.0083, LKR: 0.0033, NPR: 0.0075, ZAR: 0.055, MYR: 0.22, NZD: 0.6 };
function parseValueUsd(text){
  const s = String(text || ""); if (!s.trim()) return null;
  const cur = /₹|\bINR\b|\bRs\.?/i.test(s) ? "INR" : /\bAED\b|\bdhs?\b/i.test(s) ? "AED" : /\bSAR\b|\bSR\b/i.test(s) ? "SAR" : /\bQAR\b/i.test(s) ? "QAR" : /\bOMR\b/i.test(s) ? "OMR" : /\bBHD\b/i.test(s) ? "BHD" : /\bKWD\b/i.test(s) ? "KWD"
    : /€|\bEUR\b/i.test(s) ? "EUR" : /£|\bGBP\b/i.test(s) ? "GBP" : /\bAUD\b|A\$/i.test(s) ? "AUD" : /\bCAD\b|C\$/i.test(s) ? "CAD" : /\$|\bUSD\b/i.test(s) ? "USD" : null;
  if (!cur) return null;
  let max = null;
  for (const m of s.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr|crores?|m|mn|million)?\b/gi)) {
    let n = parseFloat(m[1].replace(/,/g, "")); const u = (m[2] || "").toLowerCase();
    if (u === "k") n *= 1e3; else if (/^(lakh|lac|l)/.test(u)) n *= 1e5; else if (/^cr/.test(u)) n *= 1e7; else if (/^(m|mn|million)$/.test(u)) n *= 1e6;
    if (!isNaN(n) && (max === null || n > max)) max = n;
  }
  return max === null ? null : Math.round(max * USD_RATES[cur]);
}
const valueUsd = x => typeof x.valueUsd === "number" ? x.valueUsd : parseValueUsd(x.budget);
const COUNTRY_ALIASES = [
  [/\b(india|bharat|bengaluru|bangalore|mumbai|pune|delhi|ncr|noida|gurgaon|gurugram|hyderabad|chennai|kolkata|ahmedabad|kochi|cochin|coimbatore|jaipur|indore|surat|lucknow|chandigarh|trivandrum|thiruvananthapuram|nagpur|vadodara|ludhiana|mysore|vizag|visakhapatnam)\b/i, "India"],
  [/\b(uae|u\.a\.e|united arab emirates|dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah)\b/i, "UAE"],
  [/\b(ksa|saudi|riyadh|jeddah|dammam|khobar|mecca|makkah|medina|madinah)\b/i, "Saudi Arabia"],
  [/\b(qatar|doha)\b/i, "Qatar"], [/\b(oman|muscat)\b/i, "Oman"], [/\b(bahrain|manama)\b/i, "Bahrain"], [/\b(kuwait)\b/i, "Kuwait"],
  [/\b(usa|u\.s\.a?|united states|america|new york|california|texas|san francisco)\b/i, "United States"],
  [/\b(uk|u\.k|united kingdom|england|london|scotland|britain)\b/i, "United Kingdom"],
  [/\b(canada|toronto|vancouver)\b/i, "Canada"], [/\b(australia|sydney|melbourne)\b/i, "Australia"], [/\b(singapore)\b/i, "Singapore"],
  [/\b(pakistan|karachi|lahore)\b/i, "Pakistan"], [/\b(bangladesh|dhaka)\b/i, "Bangladesh"], [/\b(sri lanka|colombo)\b/i, "Sri Lanka"], [/\b(nepal|kathmandu)\b/i, "Nepal"],
  [/\b(germany|berlin)\b/i, "Germany"], [/\b(egypt|cairo)\b/i, "Egypt"], [/\b(nigeria|lagos)\b/i, "Nigeria"], [/\b(kenya|nairobi)\b/i, "Kenya"], [/\b(south africa)\b/i, "South Africa"]
];
const xCountry = x => {
  const raw = [x.country, x.location].filter(Boolean).join(" , ");
  if (!raw) return "Not stated";
  for (const [re, name] of COUNTRY_ALIASES) if (re.test(raw)) return name;
  if (/remote|worldwide|global|anywhere/i.test(raw)) return "Remote / global";
  const last = raw.split(",").map(s => s.trim()).filter(Boolean).pop() || "";
  return last ? last.replace(/\b\w/g, c => c.toUpperCase()) : "Not stated";
};
const X_STATUS = [["new","New"],["contacted","Contacted"],["interested","Interested"],["not_relevant","Not relevant"]];
const X_CH = [["dm","Direct message"],["reply","Reply to post"],["email","Email"],["proposal","Proposal / bid"]];
Object.assign(S, { xMap: new Map(), xLast: 0, xIntents: { build: "Freelance build", hr: "Needs HR software", crm: "Needs a CRM", finance: "Needs finance software" },
  xState: null, xf: { ...X_FILTERS_EMPTY }, xSeen: ls.get("drops.xseen", 0), xPending: false });
const fmtWhen = ms => { const d = new Date(ms); return { day: d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) }; };
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
function assigneeOptions(){
  const people = (S.team || []).filter(m => m.email).map(m => [m.email, m.email === S.uid ? `${m.name || m.email} (you)` : (m.name || m.email)]);
  const names = (S.cfg.salesTeam || []).map(n => ["name:" + n, n]);
  return [...people, ...names];
}
function assigneeName(a){ if (!a) return ""; if (a.startsWith("name:")) return a.slice(5); if (a === S.uid) return "You"; return S.names[a]?.name || a.split("@")[0]; }
function markExtractSeen(){ S.xSeen = Date.now(); ls.set("drops.xseen", S.xSeen); paintXBadge(); }
function paintXBadge(){ if (S.tab === "extract") { $("#xBadge").hidden = true; return; } const n = [...S.xMap.values()].filter(x => x.addedAt > S.xSeen).length; const b = $("#xBadge"); b.hidden = !n || S.tab === "extract"; b.textContent = n; }
async function syncExtracts(full){
  try {
    let r = await api("GET", "/api/extracts" + (full || !S.xLast ? "" : "?since=" + (S.xLast - 120000)));
    // Safety net: if the browser holds fewer records than the server has, reload the whole list once.
    if (!full && S.xLast && typeof r.total === "number" && S.xMap.size + r.items.filter(x => !S.xMap.has(x.id)).length !== r.total) { full = true; r = await api("GET", "/api/extracts"); }
    if (full || !S.xLast) S.xMap = new Map();
    for (const x of r.items) S.xMap.set(x.id, x);
    S.xLast = r.serverTime; S.xState = r.state; S.xTotal = r.total; if (r.intents) S.xIntents = r.intents;
    paintXBadge(); renderExtract();
  } catch {}
}
function buildExtract(){
  buildExtractHead();
  $("#xSearch").addEventListener("input", e => { S.xf.q = e.target.value.trim().toLowerCase(); renderExtract(true); });
  $("#xCountry").addEventListener("change", e => { S.xf.country = e.target.value; renderExtract(true); });
  const num = v => v.replace(/[^\d.]/g, "");
  $("#xVmin").addEventListener("input", e => { S.xf.vmin = num(e.target.value); renderExtract(true); });
  $("#xVmax").addEventListener("input", e => { S.xf.vmax = num(e.target.value); renderExtract(true); });
  $("#xHead").addEventListener("input", e => { const el = e.target.closest("input[data-f]"); if (el) { S.xf[el.dataset.f] = el.value.trim().toLowerCase(); renderExtract(true); } });
  $("#xHead").addEventListener("change", e => { const el = e.target.closest("select[data-f]"); if (el) { S.xf[el.dataset.f] = el.value; renderExtract(true); } });
  $("#xIntents").addEventListener("click", e => { const b = e.target.closest("[data-xi]"); if (b) { S.xf.intent = b.dataset.xi; renderExtract(true); } });
  $("#xExport").addEventListener("click", exportExtractCsv);
  $("#xStart").addEventListener("click", startExtract);
  $("#xReset").addEventListener("click", () => {
    S.xf = { ...X_FILTERS_EMPTY };
    ["#xSearch", "#xVmin", "#xVmax"].forEach(s => $(s).value = "");
    $$("#xHead [data-f]").forEach(el => { el.value = el.tagName === "SELECT" ? "all" : ""; });
    renderExtract(true); toast("All filters cleared");
  });
  $("#xStop").addEventListener("click", stopExtract);
  $("#xAuto").addEventListener("change", async e => {
    const on = e.target.checked;
    try { const r = await api("POST", "/api/extract/auto", { enabled: on }); S.xState = { ...S.xState, ...r.state }; toast(on ? "Automatic extract is on: every 30 minutes" : "Automatic extract is paused"); }
    catch (err) { e.target.checked = !on; toast(errMsg(err)); }
    renderExtract();
  });
  const tbl = $("#xBody");
  tbl.addEventListener("focusout", async e => {
    const ta = e.target.closest("textarea[data-xr]"); if (!ta) return;
    const x = S.xMap.get(ta.dataset.xr);
    if (x && ta.value !== (x.remarks || "")) {
      const note = ta.parentElement.querySelector(".saved"); note.textContent = "Saving…";
      try { const r = await api("PATCH", "/api/extracts/" + encodeURIComponent(x.id), { remarks: ta.value }); S.xMap.set(x.id, r.item); note.textContent = "Saved"; }
      catch (err) { note.textContent = ""; toast(errMsg(err)); }
    }
    if (S.xPending) setTimeout(() => { if (!tbl.contains(document.activeElement) || document.activeElement.tagName !== "TEXTAREA") renderExtract(); }, 50);
  });
  tbl.addEventListener("change", async e => {
    const a = e.target.closest("select[data-xa]");
    if (a) { try { const r = await api("PATCH", "/api/extracts/" + encodeURIComponent(a.dataset.xa), { assignedTo: a.value }); S.xMap.set(r.item.id, r.item); toast(a.value ? "Assigned to " + assigneeName(a.value) : "Unassigned"); renderExtract(true); } catch (err) { toast(errMsg(err)); renderExtract(true); } return; }
    const s = e.target.closest("select[data-xs]"); if (!s) return;
    try { const r = await api("PATCH", "/api/extracts/" + encodeURIComponent(s.dataset.xs), { status: s.value }); S.xMap.set(r.item.id, r.item); toast("Status updated"); }
    catch (err) { toast(errMsg(err)); renderExtract(true); }
  });
  tbl.addEventListener("click", async e => {
    const tk = e.target.closest("[data-xtake]"), rl = e.target.closest("[data-xrelease]");
    if (tk || rl) {
      const id = (tk || rl).dataset.xtake || (tk || rl).dataset.xrelease;
      try { const r = await api("PATCH", "/api/extracts/" + encodeURIComponent(id), { assignedTo: tk ? S.uid : "" }); S.xMap.set(r.item.id, r.item); toast(tk ? "It's yours. Others will see you're on it." : "Released"); renderExtract(true); }
      catch (err) { toast(errMsg(err)); }
      return;
    }
    const m = e.target.closest("[data-xmsg]"); if (m) openExtractMessage(m.dataset.xmsg);
    const p = e.target.closest("[data-xlead]");
    if (p) {
      p.disabled = true;
      try { const r = await api("POST", "/api/extracts/" + encodeURIComponent(p.dataset.xlead) + "/to-pipeline"); S.xMap.set(r.item.id, r.item); mergeLeads([r.lead]); toast("Added to pipeline"); renderExtract(true); }
      catch (err) { toast(errMsg(err)); p.disabled = false; }
    }
  });
}
function paintRunControls(){
  const st = S.xState || {}; const admin = isAdmin();
  $("#xStart").hidden = !admin || !!st.running;
  $("#xStop").hidden = !admin || !st.running;
  $("#xStop").disabled = !!st.stopping; $("#xStop").textContent = st.stopping ? "Stopping…" : "Stop extract";
  $("#xAuto").checked = !st.paused;
  const box = $("#xRunBox");
  if (st.running) {
    box.hidden = false; box.className = "runbox";
    box.innerHTML = `<span class="spin"></span><span class="phase"></span><div class="bar"><i></i></div><span class="meta"></span>`;
    box.querySelector(".phase").textContent = st.stopping ? "Stopping after the current step…" : (st.progress?.phase || "Starting…");
    box.querySelector(".meta").textContent = `Started ${ago(st.runningSince || Date.now())} · ${st.progress?.added || 0} new so far`;
  } else if (S.xJustFinished) {
    const r = st.lastRun || {}; box.hidden = false; box.className = "runbox " + (r.cancelled ? "stopped" : "done");
    box.innerHTML = `<span class="phase"></span><span class="meta"></span><button class="btn small ghost" type="button" id="xDismiss">Dismiss</button>`;
    box.querySelector(".phase").textContent = r.cancelled ? `Extract stopped: ${r.added || 0} new record${r.added === 1 ? "" : "s"} saved` : `Extract finished: ${r.added || 0} new record${r.added === 1 ? "" : "s"} added`;
    box.querySelector(".meta").textContent = r.added ? "New rows are marked with an orange edge in the table below." : "Nothing new this time; the table shows everything found so far.";
    $("#xDismiss").onclick = () => { S.xJustFinished = false; paintRunControls(); };
  } else box.hidden = true;
}
let xWatch = null;
function watchExtract(){
  clearTimeout(xWatch);
  if (!S.signedIn) return;
  xWatch = setTimeout(async () => {
    try {
      const { state } = await api("GET", "/api/extract/state");
      const was = S.xState?.running; S.xState = { ...S.xState, ...state };
      if (was && !state.running) { S.xJustFinished = true; await syncExtracts(true); toast(state.lastRun?.cancelled ? "Extract stopped" : `Extract finished: ${state.lastRun?.added || 0} new`); }
      else { if (state.progress?.added) await syncExtracts(false); renderExtract(); }
    } catch {}
    if (S.xState?.running) watchExtract(); else xWatch = null;
  }, 3000);
}
async function startExtract(){
  const b = $("#xStart"); b.disabled = true;
  try {
    const r = await api("POST", "/api/extract/start");
    S.xState = { ...S.xState, ...r.state, running: true, runningSince: r.state.runningSince || Date.now(), progress: r.state.progress || { phase: "Starting…", added: 0 } };
    S.xJustFinished = false; if (r.message && r.message !== "Extract started.") toast(r.message);
    renderExtract(); watchExtract();
  } catch (err) { toast(errMsg(err)); } finally { b.disabled = false; }
}
async function stopExtract(){
  const b = $("#xStop"); b.disabled = true;
  try { const r = await api("POST", "/api/extract/stop"); S.xState = { ...S.xState, ...r.state }; toast(r.message || "Stopping…"); renderExtract(); watchExtract(); }
  catch (err) { toast(errMsg(err)); b.disabled = false; }
}
function renderExtract(force){
  if (!$("#xBody")) return;
  const st = S.xState;
  paintRunControls();
  if (st?.running && !xWatch) watchExtract();
  $("#xState").innerHTML = st ? [
    `<span>Total records: <b>${S.xTotal ?? S.xMap.size}</b></span>`,
    st.paused ? `<span class="due-today">Automatic extract is paused</span>` : `<span>Automatic extract: every 30 minutes</span>`,
    st.running ? "" : st.lastRun?.finishedAt ? `<span>Last run: <b>${esc(ago(st.lastRun.finishedAt))}</b> · added <b>${st.lastRun.added || 0}</b></span>` : `<span>No runs yet. The first scheduled run starts within 30 minutes of deploying.</span>`,
    st.lastRun?.errors?.length ? `<span class="due-over" title="${esc(st.lastRun.errors.join(" | "))}">Last run had ${st.lastRun.errors.length} source error${st.lastRun.errors.length === 1 ? "" : "s"}</span>` : ""
  ].join("") : "";
  const all = [...S.xMap.values()];
  const f = S.xf;
  // dynamic filter options
  const setOpts = (sel, opts) => { const el = $(sel), sig = JSON.stringify(opts); if (el.dataset.sig !== sig) { el.innerHTML = opts.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join(""); el.dataset.sig = sig; } el.value = opts.some(o => o[0] === el.dataset.cur) ? el.dataset.cur : "all"; };
  const tally = key => { const m = new Map(); all.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  $("#xCountry").dataset.cur = f.country; setOpts("#xCountry", [["all", "All countries"], ...tally(xCountry).map(([k, n]) => [k, `${k} (${n})`])]);
  $("#xfSource").dataset.cur = f.source; setOpts("#xfSource", [["all", "All"], ...tally(x => x.platform || "Other").map(([k, n]) => [k, `${k} (${n})`])]);
  $("#xfAssigned").dataset.cur = f.assigned; setOpts("#xfAssigned", [["all", "Anyone"], ["me", "Me"], ["none", "Unassigned"], ...assigneeOptions().map(([v, n]) => [v, n.replace(/ \(you\)$/, "")])]);
  $$("#xHead [data-f], #xCountry, #xVmin, #xVmax").forEach(el => {
    const k = el.dataset.f || { xCountry: "country", xVmin: "vmin", xVmax: "vmax" }[el.id];
    el.classList.toggle("on", !!f[k] && f[k] !== "all");
  });
  const filtered = JSON.stringify(f) !== JSON.stringify(X_FILTERS_EMPTY);
  $("#xReset").disabled = !filtered;
  const cnt = k => k === "all" ? all.length : all.filter(x => x.intent === k).length;
  $("#xIntents").innerHTML = [["all", "All"], ...Object.entries(S.xIntents)].map(([k, n]) => `<button class="fchip" data-xi="${esc(k)}" aria-pressed="${f.intent === k}">${esc(n)}<span class="mono">${cnt(k)}</span></button>`).join("");
  if (S.tab !== "extract" && !force) return;
  const body = $("#xBody");
  if (!force && body.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") { S.xPending = true; return; }
  S.xPending = false;
  const has = (v, q) => !q || (v || "").toLowerCase().includes(q);
  const now = Date.now(), win = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 }[f.added];
  const vmin = f.vmin === "" ? null : Number(f.vmin), vmax = f.vmax === "" ? null : Number(f.vmax);
  const rows = all.filter(x =>
      (f.intent === "all" || x.intent === f.intent)
      && (!f.q || [x.title, x.need, x.personName, x.company, x.location, x.platform, x.remarks, x.budget, assigneeName(x.assignedTo), xCountry(x)].some(v => has(v, f.q)))
      && (f.country === "all" || xCountry(x) === f.country)
      && (vmin === null && vmax === null || ((v) => v !== null && (vmin === null || v >= vmin) && (vmax === null || v <= vmax))(valueUsd(x)))
      && (!win || now - x.addedAt <= win)
      && (!f.req || [x.title, x.need, x.budget, S.xIntents[x.intent]].some(v => has(v, f.req)))
      && (!f.who || [x.personName, x.company, x.location, xCountry(x)].some(v => has(v, f.who)))
      && (f.contact === "all" || (f.contact === "any" ? !!(x.contactEmail || x.contactPhone || x.contactUrl) : f.contact === "email" ? !!x.contactEmail : f.contact === "phone" ? !!x.contactPhone : f.contact === "link" ? !!x.contactUrl : !(x.contactEmail || x.contactPhone || x.contactUrl)))
      && (f.source === "all" || (x.platform || "Other") === f.source)
      && (f.assigned === "all" || (f.assigned === "me" ? x.assignedTo === S.uid : f.assigned === "none" ? !x.assignedTo : x.assignedTo === f.assigned))
      && (f.remarks === "all" || (f.remarks === "has" ? !!(x.remarks || "").trim() : !(x.remarks || "").trim()))
      && (f.status === "all" || (x.status || "new") === f.status))
    .sort((a, b) => b.addedAt - a.addedAt);
  $("#xShowing").textContent = all.length ? (filtered ? `Showing ${rows.length} of ${all.length}` : `${all.length} records`) : "";
  const empty = $("#xEmpty");
  if (!all.length) { body.innerHTML = ""; empty.hidden = false; empty.innerHTML = `<div class="empty"><h3>No records yet</h3><p>Extract searches public posts every 30 minutes and adds new finds here with the date and time.${isAdmin() ? " Admins can press Start extract to run one now." : ""}</p></div>`; return; }
  if (!rows.length) { body.innerHTML = ""; empty.hidden = false; empty.innerHTML = `<div class="empty"><h3>No records match these filters</h3><p>Change a filter or press Clear all.</p></div>`; return; }
  empty.hidden = true;
  const ro = !canWrite();
  body.innerHTML = rows.map(x => { const w = fmtWhen(x.addedAt); const src = safeUrl(x.sourceUrl), cu = safeUrl(x.contactUrl); const v = valueUsd(x);
      return `<tr class="${x.addedAt > S.xSeen ? "fresh" : ""}">
      <td class="when"><b>${esc(w.day)}</b>${esc(w.time)}</td>
      <td class="need"><span class="chip i-${esc(x.intent)}">${esc(S.xIntents[x.intent] || x.intent)}</span><div class="t" dir="auto" style="margin-top:6px">${esc(x.title)}</div>${x.need ? `<p dir="auto">${esc(x.need)}</p>` : ""}${x.budget ? `<p>Budget: ${esc(x.budget)}${v !== null ? ` <span class="val">≈ $${v.toLocaleString()}</span>` : ""}</p>` : ""}</td>
      <td>${x.personName ? `<div style="font-weight:600">${esc(x.personName)}</div>` : ""}${x.company ? `<div>${esc(x.company)}</div>` : ""}${!x.personName && !x.company ? `<span class="note">Name not stated</span>` : ""}<div class="note" style="margin-top:4px">${esc([x.location, xCountry(x) !== "Not stated" && !(x.location || "").toLowerCase().includes(xCountry(x).toLowerCase()) ? xCountry(x) : ""].filter(Boolean).join(" · ") || "Location not stated")}</div></td>
      <td><div class="contact">${x.contactEmail ? `<span class="mono" style="font-size:.8rem">${esc(x.contactEmail)}</span>` : ""}${x.contactPhone ? `<span class="mono" style="font-size:.8rem">${esc(x.contactPhone)}</span>` : ""}${cu ? `<a href="${esc(cu)}" target="_blank" rel="noopener noreferrer">Profile / link ↗</a>` : ""}${!x.contactEmail && !x.contactPhone && !cu ? `<span class="note">Reply on the post</span>` : ""}</div></td>
      <td class="src">${src ? `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(x.platform || "Open")} ↗</a>` : esc(x.platform)}${x.postedDate ? `<div class="note">Posted ${esc(fmtDate(x.postedDate))}</div>` : ""}</td>
      <td class="assign">${assignCell(x, ro)}</td>
      <td><label class="sr" for="xr-${esc(x.id)}">Remarks</label><textarea id="xr-${esc(x.id)}" data-xr="${esc(x.id)}" placeholder="Add a note for the team" ${ro ? "readonly" : ""}>${esc(x.remarks || "")}</textarea><div class="saved">${x.remarksBy ? esc("by " + ((S.names[x.remarksBy]?.name) || x.remarksBy.split("@")[0])) : ""}</div></td>
      <td><div class="acts" style="flex-direction:column;align-items:stretch"><label class="sr" for="xs-${esc(x.id)}">Status</label><select id="xs-${esc(x.id)}" data-xs="${esc(x.id)}" ${ro ? "disabled" : ""}>${opt(X_STATUS, x.status || "new")}</select>${ro ? "" : `<button class="btn small primary" data-xmsg="${esc(x.id)}">Write message</button>`}${x.leadId ? `<button class="btn small ghost" data-edit="${esc(x.leadId)}">In pipeline</button>` : ro ? "" : `<button class="btn small" data-xlead="${esc(x.id)}">Add to pipeline</button>`}</div></td>
    </tr>`; }).join("");
}
function buildExtractHead(){
  const sel = (f, label, opts) => `<label class="sr" for="xf-${f}">Filter ${label}</label><select id="xf-${f}" data-f="${f}">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>`;
  const txt = (f, label, ph) => `<label class="sr" for="xf-${f}">Filter ${label}</label><input type="search" id="xf-${f}" data-f="${f}" placeholder="${ph}">`;
  $("#xHead").innerHTML = `<tr><th>Added</th><th>Requirement</th><th>Who &amp; where</th><th>Contact (as posted)</th><th>Source</th><th>Assigned to</th><th>Remarks</th><th>Status</th></tr>
  <tr class="fl">
    <th>${sel("added", "added", [["all", "Any time"], ["24h", "Last 24 hours"], ["7d", "Last 7 days"], ["30d", "Last 30 days"]])}</th>
    <th>${txt("req", "requirement", "Filter…")}</th>
    <th>${txt("who", "who and where", "Name, company, city…")}</th>
    <th>${sel("contact", "contact", [["all", "Any"], ["any", "Has contact"], ["email", "Has email"], ["phone", "Has phone"], ["link", "Has link"], ["none", "No contact"]])}</th>
    <th><label class="sr" for="xfSource">Filter source</label><select id="xfSource" data-f="source"></select></th>
    <th><label class="sr" for="xfAssigned">Filter assigned to</label><select id="xfAssigned" data-f="assigned"></select></th>
    <th>${sel("remarks", "remarks", [["all", "Any"], ["has", "Has remarks"], ["none", "No remarks"]])}</th>
    <th>${sel("status", "status", [["all", "All"], ...X_STATUS])}</th>
  </tr>`;
}
function assignCell(x, ro){
  const who = x.assignedTo;
  if (isAdmin()) {
    const opts = assigneeOptions(); if (who && !opts.some(o => o[0] === who)) opts.push([who, assigneeName(who)]);
    return `<label class="sr" for="xa-${esc(x.id)}">Assigned to</label><select id="xa-${esc(x.id)}" data-xa="${esc(x.id)}"><option value="">Unassigned</option>${opt(opts, who || "")}</select>${!who ? `<button class="btn small ghost" data-xtake="${esc(x.id)}" style="margin-top:6px">Take it</button>` : ""}`;
  }
  if (!who) return ro ? `<span class="note">Unassigned</span>` : `<button class="btn small" data-xtake="${esc(x.id)}">Take it</button>`;
  if (who === S.uid) return `<span class="chip st-replied">You</span>${ro ? "" : `<div><button class="btn small ghost" data-xrelease="${esc(x.id)}" style="margin-top:6px">Release</button></div>`}`;
  return `<span class="chip st-new">${esc(assigneeName(who))}</span>`;
}
function openExtractMessage(id){
  const x = S.xMap.get(id); if (!x) return;
  let ch = x.source === "freelancer" ? "proposal" : "dm", ctl = null;
  $("#modalRoot").innerHTML = `
  <div class="scrim" id="scrim"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="xmT">
    <div class="mhead"><h2 id="xmT">Personalised message</h2><button type="button" class="btn ghost small" data-close>Close</button></div>
    <div class="opener" dir="auto"><b id="xmTitle"></b><div class="note" id="xmMeta" style="margin-top:4px"></div></div>
    <div class="field"><span class="lbl" id="xmCl">Type</span><div class="seg" role="group" aria-labelledby="xmCl" id="xmCh">${X_CH.map(([k, n]) => `<button type="button" data-c="${k}">${esc(n)}</button>`).join("")}</div></div>
    <div class="row">
      <div class="field"><label for="xmLang">Language</label><select id="xmLang"><option>English</option><option>Hindi</option><option>Hinglish</option><option>Arabic</option><option>Tamil</option><option>Telugu</option><option>Malayalam</option></select></div>
      <div class="field" style="flex:2 1 260px"><label for="xmExtra">Anything to include</label><input type="text" id="xmExtra" placeholder="e.g. We built a similar CRM for a Dubai distributor"></div>
    </div>
    <div class="row"><button class="btn primary" id="xmGo">Write message</button><button class="btn ghost" id="xmStop" hidden>Stop</button></div>
    <div class="out card" id="xmOut" dir="auto" style="min-height:140px"></div>
    <div class="mfoot"><span class="note">Read and edit before sending. Contact only people who asked publicly.</span><div class="row" style="gap:8px"><button class="btn small" id="xmCopy" disabled>Copy</button><button class="btn small primary" id="xmDone" disabled>Mark as contacted</button></div></div>
  </div></div>`;
  $("#xmTitle").textContent = x.title;
  $("#xmMeta").textContent = [x.personName, x.company, x.location, x.platform].filter(Boolean).join(" · ");
  const paintCh = () => $$("#xmCh [data-c]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.c === ch)));
  paintCh();
  $("#xmCh").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (b) { ch = b.dataset.c; paintCh(); } });
  const close = () => { ctl?.abort(); $("#modalRoot").innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  $("#scrim").addEventListener("click", e => { if (e.target.id === "scrim" || e.target.closest("[data-close]")) close(); });
  $("#xmOut").innerHTML = `<span class="note">Choose a type and press Write message.</span>`;
  $("#xmStop").onclick = () => ctl?.abort();
  $("#xmCopy").onclick = () => copyText($("#xmOut").textContent, $("#xmOut"));
  $("#xmDone").onclick = async () => {
    try { const r = await api("PATCH", "/api/extracts/" + encodeURIComponent(id), { status: "contacted" }); S.xMap.set(id, r.item); toast("Marked as contacted"); close(); renderExtract(true); }
    catch (err) { toast(errMsg(err)); }
  };
  $("#xmGo").onclick = async () => {
    ctl = new AbortController(); let text = "";
    $("#xmGo").disabled = true; $("#xmStop").hidden = false; $("#xmCopy").disabled = true;
    $("#xmOut").innerHTML = `<div class="thinking"><span class="spin"></span>Writing a message for this requirement…</div>`;
    try {
      const r = await fetch("/api/extracts/" + encodeURIComponent(id) + "/message", { method: "POST", signal: ctl.signal, credentials: "same-origin",
        headers: { "content-type": "application/json", "x-cg": "1" }, body: JSON.stringify({ channel: ch, lang: $("#xmLang").value, extra: $("#xmExtra").value.trim() }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw { message: j.error }; }
      const reader = r.body.getReader(), dec = new TextDecoder();
      for (;;) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); $("#xmOut").textContent = text; }
      $("#xmCopy").disabled = !text.trim(); $("#xmDone").disabled = false;
    } catch (e) {
      if (e?.name === "AbortError") { if (!text) $("#xmOut").innerHTML = ""; }
      else if (!text) $("#xmOut").innerHTML = `<div class="banner bad">${esc(errMsg(e))}</div>`;
      $("#xmCopy").disabled = !text.trim();
    } finally { const g = $("#xmGo"); if (g) { g.disabled = false; g.textContent = "Try another"; $("#xmStop").hidden = true; } }
  };
}
function exportExtractCsv(){
  const cols = [["addedAt","Added"],["intent","Type"],["title","Requirement"],["need","Details"],["budget","Budget"],["personName","Person"],["company","Company"],["location","Location"],
    ["contactEmail","Email"],["contactPhone","Phone"],["contactUrl","Contact link"],["platform","Platform"],["sourceUrl","Source URL"],["postedDate","Posted"],["assignedTo","Assigned to"],["status","Status"],["remarks","Remarks"]];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [...S.xMap.values()].sort((a, b) => b.addedAt - a.addedAt).map(x => cols.map(([k]) => q(k === "addedAt" ? new Date(x.addedAt).toLocaleString() : k === "intent" ? (S.xIntents[x.intent] || x.intent) : k === "assignedTo" ? (x.assignedTo === S.uid ? (S.me?.name || S.uid) : assigneeName(x.assignedTo)) : x[k])).join(","));
  const csv = "﻿" + [cols.map(c => c[1]).join(","), ...rows].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `drops-extract-${dstr()}.csv`; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- sign in ---------- */
function showAuth(mode, note){
  $("#boot").hidden = true; $("#appView").hidden = true; $("#authView").hidden = false;
  $("#loginForm").hidden = mode !== "login"; $("#signupForm").hidden = mode !== "signup"; $("#pendingView").hidden = mode !== "pending";
  $("#authTitle").textContent = mode === "signup" ? "Request access" : mode === "pending" ? "Almost there" : "Sign in";
  const doms = (S.pub?.domains || []).map(d => "@" + d).join(", ");
  $("#authSub").textContent = note || (mode === "pending" ? "" : `${S.pub?.company || "Drops"} sales team.${doms ? ` Use your ${doms} address.` : mode === "signup" ? " Create your account with your work or personal email." : ""}`);
  $("#suBtn").textContent = S.pub?.approval ? "Request access" : "Create account";
  $("#authTitle").textContent = mode === "signup" ? (S.pub?.approval ? "Request access" : "Create your account") : $("#authTitle").textContent;
  $("#gsiWrap").hidden = mode === "pending" || !S.pub?.googleClientId;
}
document.addEventListener("click", e => { const a = e.target.closest("[data-auth]"); if (a) showAuth(a.dataset.auth); });
function initGoogle(){
  if (!S.pub?.googleClientId) return;
  const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
  s.onload = () => {
    google.accounts.id.initialize({ client_id: S.pub.googleClientId, callback: async ({ credential }) => {
      try { const r = await api("POST", "/api/auth/google", { credential }); if (r.status === "pending") showAuth("pending"); else start(); }
      catch (err) { $("#liErr").textContent = errMsg(err); showAuth("login"); }
    } });
    google.accounts.id.renderButton($("#gsiBtn"), { theme: "outline", size: "large", width: 300, text: "continue_with" });
  };
  document.head.append(s);
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#liErr").textContent = "";
  const btn = e.submitter; if (btn) btn.disabled = true;
  try { await api("POST", "/api/auth/login", { email: $("#liEmail").value.trim(), password: $("#liPw").value }); $("#liPw").value = ""; await start(); }
  catch (err) { $("#liErr").textContent = errMsg(err); }
  finally { if (btn) btn.disabled = false; }
});
$("#signupForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#suErr").textContent = "";
  const btn = e.submitter; if (btn) btn.disabled = true;
  try {
    const r = await api("POST", "/api/auth/signup", { name: $("#suName").value.trim(), email: $("#suEmail").value.trim(), password: $("#suPw").value, setupCode: $("#suCode").value.trim() });
    $("#suPw").value = "";
    if (r.status === "active") await start(); else showAuth("pending");
  } catch (err) { $("#suErr").textContent = errMsg(err); }
  finally { if (btn) btn.disabled = false; }
});
$("#meBtn").addEventListener("click", () => { const p = $("#mePop"); p.hidden = !p.hidden; $("#meBtn").setAttribute("aria-expanded", String(!p.hidden)); });
$("#signOut").addEventListener("click", async () => { try { await api("POST", "/api/auth/logout"); } catch {} S.signedIn = false; clearInterval(S.poll); location.hash = ""; showAuth("login"); });

/* ---------- boot ---------- */
let built = false;
async function start(){
  let me;
  try { me = (await api("GET", "/api/me")).user; } catch { showAuth("login"); return; }
  S.me = me; S.my = me.settings || {}; S.signedIn = true;
  S.names[me.email] = { name: me.name, picture: me.picture };
  $("#authView").hidden = true; $("#boot").hidden = true; $("#appView").hidden = false;
  $("#meName").textContent = me.name || me.email; $("#meAvatar").innerHTML = avatarHTML(me.email, me.name, me.picture);
  $("#teamTab").hidden = !isAdmin();
  if (!built) { built = true; buildExtract(); buildFind(); buildQualify(); buildWrite(); buildPipeline(); buildMe(); buildTeamAdmin(); }
  if (!canWrite()) { const g = $("#globalBanner"); g.hidden = false; g.className = "banner"; g.style.marginBottom = "16px"; g.textContent = "You have view-only access. Ask an admin to make you a Member so you can add and update leads."; }
  paintMe();
  go((location.hash || "").slice(1) || (me.mustChangePassword ? "products" : "today"));
  ["#xAutoWrap"].forEach(s => $(s).hidden = !isAdmin());
  const [cfg] = await Promise.all([api("GET", "/api/config").catch(() => null), loadTeam(), syncLeads(true), syncExtracts(true)]);
  if (cfg) { S.cfg = cfg.config; onCfg(); }
  if (isAdmin()) api("GET", "/api/admin/users").then(r => { const n = r.users.filter(u => u.status === "pending").length; $("#pendingBadge").hidden = !n; $("#pendingBadge").textContent = n; }).catch(() => {});
  clearInterval(S.poll);
  S.poll = setInterval(() => { if (document.visibilityState === "visible" && S.signedIn) { syncLeads(false); syncExtracts(false); } }, 60000);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.signedIn) { syncLeads(false); syncExtracts(false); } });
(async function boot(){
  try { S.pub = await (await fetch("/api/public-config")).json(); } catch { S.pub = { domains: ["gmail.com"] }; }
  initGoogle();
  await start();
})();
