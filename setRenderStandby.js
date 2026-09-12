// One-off: put the legacy Render node into standby (schedulers off) for the Railway cutover.
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI",
  authDomain: "whatanagent-a1e59.firebaseapp.com",
  projectId: "whatanagent-a1e59",
  storageBucket: "whatanagent-a1e59.firebasestorage.app",
  messagingSenderId: "410197132578",
  appId: "1:410197132578:web:97cfc3ae33f39ed3df917b"
};

const db = getFirestore(initializeApp(firebaseConfig));

await setDoc(doc(db, "appData", "runtimeConfig"), {
  renderStandby: true,
  note: "Render kept as silent standby after the Railway production cutover (2026-09-12). Set renderStandby:false to hand the 60s schedulers back to Render within 60s (no restart needed).",
  setAt: Date.now()
}, { merge: true });

console.log("renderStandby = true (Render schedulers will stop on its next boot / tick)");
process.exit(0);
