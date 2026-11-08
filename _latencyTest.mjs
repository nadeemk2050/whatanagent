// TEMP: latency + model availability test for the live key
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
const app = initializeApp({ apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI", projectId: "whatanagent-a1e59" });
const db = getFirestore(app);
const s = (await getDoc(doc(db, "appData", "settings"))).data() || {};
const key = s.GEMINI_API_KEY;
if (!key) { console.log("no key"); process.exit(1); }

const PROMPT = "You are a sales assistant for a plastic scrap trading company. A customer asks: 'Do you have recycled LLDPE? What quantity can you supply and what is the price?' Reply in 2 short sentences.";

async function call(model, extra = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: PROMPT }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.4, ...extra } })
    });
    const j = await r.json();
    const ms = Date.now() - t0;
    if (!r.ok) return { ms, err: (j.error?.message || "").split("\n")[0].slice(0, 110), code: r.status };
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    return { ms, text: text.slice(0, 90), out: j.usageMetadata?.candidatesTokenCount, thoughts: j.usageMetadata?.thoughtsTokenCount };
  } catch (e) { return { ms: Date.now() - t0, err: e.message }; }
}

for (const m of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"]) {
  const r = await call(m);
  console.log(`${m.padEnd(18)} ${r.code ? "HTTP " + r.code : "ok"} ${String(r.ms).padStart(5)}ms  ${r.err ? "❌ " + r.err : `out=${r.out ?? "?"} thoughts=${r.thoughts ?? 0} -> "${r.text}"`}`);
}

console.log("\n--- thinking budget 0 (speed test) ---");
for (const m of ["gemini-3.8-flash", "gemini-3.5-flash"]) {
  const r = await call(m, { thinkingConfig: { thinkingBudget: 0 } });
  console.log(`${m.padEnd(18)} ${r.code ? "HTTP " + r.code : "ok"} ${String(r.ms).padStart(5)}ms  ${r.err ? "❌ " + r.err : `out=${r.out ?? "?"} thoughts=${r.thoughts ?? 0} -> "${r.text}"`}`);
}
process.exit(0);
