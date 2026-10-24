import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const sa = JSON.parse(fs.readFileSync('/opt/whatanagent-data/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();
const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';
for (const id of ['Oaka1hvRdAExMa7T4EW7', 'tJ1hG5ixNCeK2cUhnGLm', '1JwReQV33ZJDYeblj2VY']) {
  const d = await db.doc(`${BASE}/tasks_for_all/${id}`).get();
  const v = d.data() || {};
  console.log(id, JSON.stringify({ status: v.status, teamId: v.teamId, createdBy: v.createdBy, createdByName: v.createdByName, assigneeEmail: v.assigneeEmail, ownerAdminEmail: v.ownerAdminEmail, createdAt: v.createdAt && v.createdAt.constructor ? v.createdAt.constructor.name : typeof v.createdAt }));
}
process.exit(0);
