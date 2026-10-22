// Data access. Firestore in production; an in-memory store for local development (DEV_MEMORY_STORE=1).
import crypto from "node:crypto";

export async function createStore() {
  if (process.env.DEV_MEMORY_STORE) return memoryStore();
  const { Firestore } = await import("@google-cloud/firestore");
  const db = new Firestore({ ignoreUndefinedProperties: true, ...(process.env.FIRESTORE_DATABASE ? { databaseId: process.env.FIRESTORE_DATABASE } : {}) });
  const users = db.collection("users");
  const leads = db.collection("leads");
  const cfgDoc = db.collection("config").doc("main");
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
    async setConfig(cfg) { await cfgDoc.set(cfg); }
  };
}

function memoryStore() {
  const users = new Map(), leads = new Map(); let cfg = null;
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
    async setConfig(c) { cfg = clone(c); }
  };
}
