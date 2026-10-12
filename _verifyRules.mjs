import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const cfg = { apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI", authDomain: "whatanagent-a1e59.firebaseapp.com", projectId: "whatanagent-a1e59", storageBucket: "whatanagent-a1e59.firebasestorage.app", messagingSenderId: "410197132578", appId: "1:410197132578:web:97cfc3ae33f39ed3df917b" };
const B = `artifacts/${cfg.appId}/public/data`;
const db = getFirestore(initializeApp(cfg));
async function probe(label, path, expectDenied) {
  try {
    const snap = await getDocs(collection(db, path));
    console.log(`${label}: READ OK (${snap.size} docs) ${expectDenied ? "EXPECTED DENY!" : "ok"}`);
  } catch (e) {
    const denied = /permission|insufficient/i.test(((e && e.message) || "") + ((e && e.code) || ""));
    console.log(`${label}: ${denied ? "DENIED (correct)" : "ERROR " + e.message} ${expectDenied ? "" : " <-- EXPECTED ALLOW"}`);
  }
}
await probe("board tasks_for_all (unauth)", `${B}/tasks_for_all`, true);
await probe("board staff (unauth)", `${B}/staff`, true);
await probe("board tasks (unauth)", `${B}/tasks`, true);
await probe("invites (unauth, allowed by design)", `${B}/invites`, false);
await probe("teams (unauth, needs sign-in)", `${B}/teams`, true);
await probe("non-board appData (unauth)", "appData", false);
await probe("non-board contactBook (unauth)", "contactBook", false);
process.exit(0);
