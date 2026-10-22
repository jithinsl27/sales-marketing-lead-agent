// Data access. Firestore in production; an in-memory store for local development (DEV_MEMORY_STORE=1).
import crypto from "node:crypto";

export async function createStore() {
  if (process.env.DEV_MEMORY_STORE) return memoryStore();
  const { Firestore } = await import("@google-cloud/firestore");
  const db = new Firestore({ ignoreUndefinedProperties: true, ...(process.env.FIRESTORE_DATABASE ? { databaseId: process.env.FIRESTORE_DATABASE } : {}) });
  const users = db.collection("users");
  const leads = db.collection("leads");
  const cfgDoc = db.collection("config").doc("main");
  const extracts = db.collection("extracts");
  const stateDoc = db.collection("config").doc("extract");
  const key = email => encodeURIComponent(email.toLowerCase());
  const withId = d => ({ id: d.id, ...d.data() });
  return {
    kind: "firestore",
    async getUser(email) { const s = await users.doc(key(email)).get(); return s.exists ? s.data() : null; },
    async putUser(email, data) { await users.doc(key(email)).set(data, { merge: true }); },
    async listUsers() { return (await users.get()).docs.map(d => d.data()); },
    async countUsers() { return (await users.count().get()).data().count; },
    async listLeads(since) {
      const q = since ? leads.where("updatedAt", ">", since) : leads;
      return (await q.get()).docs.map(withId);
    },
    async getLead(id) { const s = await leads.doc(id).get(); return s.exists ? withId(s) : null; },
    async createLead(data) { const ref = leads.doc(); await ref.set(data); return { id: ref.id, ...data }; },
    async updateLead(id, patch) { await leads.doc(id).set(patch, { merge: true }); return this.getLead(id); },
    async getConfig() { const s = await cfgDoc.get(); return s.exists ? s.data() : null; },
    async setConfig(cfg) { await cfgDoc.set(cfg); },
    // ---- Extract ----
    async listExtracts(since) {
      const q = since ? extracts.where("updatedAt", ">", since) : extracts.orderBy("addedAt", "desc").limit(2000);
      return (await q.get()).docs.map(withId);
    },
    async getExtract(id) { const s = await extracts.doc(id).get(); return s.exists ? withId(s) : null; },
    async updateExtract(id, patch) { await extracts.doc(id).set(patch, { merge: true }); return this.getExtract(id); },
    async createExtractIfNew(id, data) {
      try { await extracts.doc(id).create(data); return true; }
      catch (e) { if (e.code === 6) return false; throw e; } // 6 = ALREADY_EXISTS
    },
    async getExtractState() { const s = await stateDoc.get(); return s.exists ? s.data() : {}; },
    async setExtractState(patch) { await stateDoc.set(patch, { merge: true }); },
    async acquireExtractLock(now, staleMs) {
      return db.runTransaction(async tx => {
        const s = await tx.get(stateDoc); const st = s.exists ? s.data() : {};
        if (st.runningSince && now - st.runningSince < staleMs) return { ok: false, state: st };
        tx.set(stateDoc, { runningSince: now }, { merge: true });
        return { ok: true, state: st };
      });
    }
  };
}

function memoryStore() {
  const users = new Map(), leads = new Map(), ex = new Map(); let cfg = null, xstate = {};
  const clone = o => o == null ? o : structuredClone(o);
  return {
    kind: "memory",
    async getUser(email) { return clone(users.get(email.toLowerCase()) || null); },
    async putUser(email, data) { const k = email.toLowerCase(); users.set(k, { ...(users.get(k) || {}), ...clone(data) }); },
    async listUsers() { return [...users.values()].map(clone); },
    async countUsers() { return users.size; },
    async listLeads(since) { return [...leads.values()].filter(l => !since || l.updatedAt > since).map(clone); },
    async getLead(id) { return clone(leads.get(id) || null); },
    async createLead(data) { const id = crypto.randomBytes(10).toString("hex"); leads.set(id, { id, ...clone(data) }); return clone(leads.get(id)); },
    async updateLead(id, patch) { leads.set(id, { ...leads.get(id), ...clone(patch) }); return clone(leads.get(id)); },
    async getConfig() { return clone(cfg); },
    async setConfig(c) { cfg = clone(c); },
    async listExtracts(since) { return [...ex.values()].filter(x => !since || x.updatedAt > since).sort((a, b) => b.addedAt - a.addedAt).map(clone); },
    async getExtract(id) { return clone(ex.get(id) || null); },
    async updateExtract(id, patch) { ex.set(id, { ...ex.get(id), ...clone(patch) }); return clone(ex.get(id)); },
    async createExtractIfNew(id, data) { if (ex.has(id)) return false; ex.set(id, { id, ...clone(data) }); return true; },
    async getExtractState() { return clone(xstate); },
    async setExtractState(p) { xstate = { ...xstate, ...clone(p) }; },
    async acquireExtractLock(now, staleMs) { if (xstate.runningSince && now - xstate.runningSince < staleMs) return { ok: false, state: clone(xstate) }; const st = clone(xstate); xstate.runningSince = now; return { ok: true, state: st }; }
  };
}
