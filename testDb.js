import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI",
  projectId: "whatanagent-a1e59"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snapshot = await getDocs(collection(db, "chats", "1234567890", "messages"));
  console.log("Found messages:", snapshot.docs.length);
  snapshot.forEach(doc => console.log(doc.data()));
}
check().catch(console.error);
