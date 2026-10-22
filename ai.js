// Gemini on Vertex AI. Uses the Cloud Run service account, so no API key is stored anywhere.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const LOCATION = process.env.GEMINI_LOCATION || "global";
let thinkingLevel = process.env.GEMINI_THINKING_LEVEL ?? "low"; // "low" keeps cost and latency down; "" disables

export async function createAI() {
  if (process.env.DEV_FAKE_AI) return fakeAI();
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: LOCATION });
  const config = extra => ({ maxOutputTokens: 8192, ...extra, ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}) });
  // If this model rejects the thinking setting, drop it once and carry on.
  async function call(fn) {
    try { return await fn(); }
    catch (e) {
      if (thinkingLevel && /thinking/i.test(String(e?.message))) { console.warn("Disabling thinkingLevel:", e.message); thinkingLevel = ""; return fn(); }
      throw e;
    }
  }
  return {
    model: MODEL,
    async json(prompt) {
      const r = await call(() => ai.models.generateContent({ model: MODEL, contents: prompt, config: config({ responseMimeType: "application/json", temperature: 0.4 }) }));
      return parseJSON(r.text || "");
    },
    // Google Search grounding: returns the model's text plus the web sources it actually used.
    async search(prompt, signal) {
      const r = await call(() => ai.models.generateContent({ model: MODEL, contents: prompt,
        config: config({ tools: [{ googleSearch: {} }], temperature: 0.2, abortSignal: signal }) }));
      const meta = r.candidates?.[0]?.groundingMetadata || {};
      const sources = (meta.groundingChunks || []).map(c => ({ title: c.web?.title || "", uri: c.web?.uri || "", domain: c.web?.domain || "" }));
      return { text: r.text || "", sources, queries: meta.webSearchQueries || [] };
    },
    async stream(prompt, onText, signal) {
      const s = await call(() => ai.models.generateContentStream({ model: MODEL, contents: prompt, config: config({ temperature: 0.8, abortSignal: signal }) }));
      for await (const chunk of s) { if (signal?.aborted) break; const t = chunk.text; if (t) onText(t); }
    }
  };
}

export function parseJSON(text) {
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("Model reply was not JSON");
}

function fakeAI() {
  return {
    model: "fake",
    async json() {
      return { summary: "Demo brief from the local fake model.", fit: { hr: 72, fin: 55 }, recommended: "hr",
        why: ["Growing headcount", "Shift-based staff"], pains: ["Manual attendance registers"], contacts: ["Founder / MD — signs off on software"],
        opener: "Saw you're hiring two HR executives in Pune this month.", questions: ["How do you track attendance today?"], unknowns: ["Current HR tool"] };
    },
    async search(prompt, signal) {
      await new Promise((ok, no) => { const t = setTimeout(ok, Number(process.env.DEV_FAKE_DELAY || 0)); signal?.addEventListener("abort", () => { clearTimeout(t); no(new Error("aborted")); }); });
      const intent = (prompt.match(/INTENT=(\w+)/) || [])[1] || "crm";
      return {
        text: JSON.stringify([{ title: `Looking for a ${intent} solution for our 40-person team`, need: "Small distributor in Pune comparing tools; wants a demo this month.",
          personName: "Demo Poster", company: "Demo Traders", location: "Pune, India", contactEmail: "", contactPhone: "", contactUrl: "https://www.linkedin.com/in/demo",
          platform: "LinkedIn", sourceUrl: `https://www.linkedin.com/posts/demo-${intent}-${Math.floor(Date.now() / 1800000)}`, postedDate: new Date().toISOString().slice(0, 10),
          budget: { crm: "₹2,50,000", hr: "AED 15k", finance: "$3,000", build: "$800–1,500", other: "" }[intent] || "", budgetAmount: { crm: 250000, hr: 15000, finance: 3000, build: 1500 }[intent] || "",
          budgetCurrency: { crm: "INR", hr: "AED", finance: "USD", build: "USD" }[intent] || "", country: intent === "hr" ? "UAE" : "India", location: intent === "hr" ? "Dubai, UAE" : "Pune, India" },
          { title: "Unverifiable item", sourceUrl: "https://made-up.example/post", platform: "Blog" }]),
        sources: [{ title: "linkedin.com", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x", domain: "linkedin.com" }], queries: ["demo"]
      };
    },
    async stream(prompt, onText, signal) {
      for (const w of "Subject: Quick idea for your HR team\n\nHi there, this is a local demo draft.".split(" ")) {
        if (signal?.aborted) return; onText(w + " "); await new Promise(r => setTimeout(r, 30));
      }
    }
  };
}
