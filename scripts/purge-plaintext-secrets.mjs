/**
 * Remove plaintext secrets from appData/settings.
 *
 * The Firestore project is shared with the public web pages, so the settings document must never
 * hold API keys. This script deletes each secret field - but ONLY after the live server reports
 * that the same value is being supplied by its environment (Render env vars). Anything that is
 * still DB-only is left alone and reported, so running this can never break the running app.
 *
 * Usage:  node scripts/purge-plaintext-secrets.mjs [--apply]
 *         (without --apply it only reports what it would do)
 */
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteField } from "firebase/firestore";

const SERVER = process.env.SERVER_URL || "https://whatanagent.onrender.com";
const APPLY = process.argv.includes("--apply");
const SECRETS = [
  "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "QWEN_API_KEY", "QWEN_BASE_URL",
  "WHATSAPP_TOKEN", "VERIFY_TOKEN", "PHONE_NUMBER_ID"
];

const app = initializeApp({ apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI", projectId: "whatanagent-a1e59" });
const db = getFirestore(app);

// 1) ask the running server which secrets it already gets from its environment
let fromEnv = [];
try {
  const r = await fetch(`${SERVER}/api/env`);
  const j = await r.json();
  fromEnv = Array.isArray(j.KEYS_FROM_ENV) ? j.KEYS_FROM_ENV : [];
  console.log(`server ${SERVER} reports ${fromEnv.length} secret(s) coming from the environment:`);
  console.log(fromEnv.length ? "  " + fromEnv.join(", ") : "  (none)");
} catch (e) {
  console.log(`could not reach ${SERVER}: ${e.message}`);
  console.log("Nothing will be purged - the server must be able to read the secrets first.");
  process.exit(1);
}

// 2) look at the stored document
const ref = doc(db, "appData", "settings");
const snap = await getDoc(ref);
if (!snap.exists()) { console.log("no settings document"); process.exit(0); }
const stored = snap.data() || {};

const patch = {};
for (const k of SECRETS) {
  const present = stored[k] !== undefined && stored[k] !== null && stored[k] !== "";
  if (!present) continue;
  if (fromEnv.includes(k)) { patch[k] = deleteField(); console.log(`  → purge ${k} (now supplied by the environment)`); }
  else console.log(`  ⚠️  keep ${k} - it is ONLY in the database, add it to Render env vars first`);
}

if (!Object.keys(patch).length) { console.log("\nNothing to purge."); process.exit(0); }
if (!APPLY) { console.log(`\nDry run. Re-run with --apply to delete ${Object.keys(patch).length} field(s).`); process.exit(0); }

await setDoc(ref, patch, { merge: true });
console.log(`\n✅ Purged ${Object.keys(patch).length} plaintext secret field(s) from appData/settings.`);

// 3) verify
const after = (await getDoc(ref)).data() || {};
const left = SECRETS.filter(k => after[k]);
console.log(left.length ? `still stored in the database: ${left.join(", ")}` : "the document now holds no secrets ✅");
process.exit(0);
