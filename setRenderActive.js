// One-off: hand production BACK to Render (2026-09-24 cutback - Railway paused).
// Sets appData/runtimeConfig { renderStandby: false } so:
//   - the Render node runs the 60s schedulers again (live-checked every tick, no restart needed), and
//   - on Render's NEXT BOOT it owns the WhatsApp Web (Baileys) linked-device session again.
// Reverse with: node setRenderStandby.js
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
  renderStandby: false,
  note: "2026-09-24: Render is the MAIN node again (Railway paused). renderStandby:false = Render owns the 60s schedulers + WhatsApp-Web session. Set renderStandby:true (setRenderStandby.js) to retire Render again.",
  setAt: Date.now()
}, { merge: true });

console.log("renderStandby = false (Render ACTIVE - schedulers resume within 60s; WhatsApp-Web connects on next boot)");
process.exit(0);
