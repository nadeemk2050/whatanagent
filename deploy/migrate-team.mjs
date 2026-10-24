// One-time migration: bring the existing Firestore team (users + staff) into
// the AlignTasks staff file, so names, Firebase uids and team access survive.
//
//   node deploy/migrate-team.mjs --dry
//   node deploy/migrate-team.mjs
//
// Staff imported this way have no password yet; the owner sets each one from
// the Staff panel. Their alias keeps old assigneeEmail values working.
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { importStaff, getStaffByHandle, listStaff, upsertStaff } from '../alignAuth.mjs';

const sa = JSON.parse(fs.readFileSync('/opt/whatanagent-data/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';
const DRY = process.argv.includes('--dry');

// The owner already has a hand-made account; these legacy addresses belong to him.
const OWNER_ALIASES = ['nadeemalsaham@gmail.com', 'nadeemalsaham', 'nh@nh.com'];
// Obvious throwaway sign-ups from testing — importing them would only add noise.
const SKIP_EMAILS = /@nd\.com$|@asd\.com$/;

const snap = await db.collection(`${BASE}/users`).limit(500).get();
console.log('users documents:', snap.size);

let imported = 0, skipped = 0;
for (const doc of snap.docs) {
  const u = doc.data() || {};
  const email = String(u.email || '').trim().toLowerCase();
  const name = String(u.name || u.displayName || '').trim() || email.split('@')[0];
  const teamIds = Array.isArray(u.teamIds) ? u.teamIds : (u.teamId ? [u.teamId] : []);

  if (OWNER_ALIASES.includes(email) || OWNER_ALIASES.includes(name.toLowerCase())) {
    console.log(`  ALIAS  ${name} <${email}> -> owner "nadeem"`);
    const owner = getStaffByHandle('nadeem');
    if (!DRY && owner) {
      upsertStaff({ handle: 'nadeem', name: owner.name || 'Nadeem Khan', role: owner.role, teamIds: owner.teamIds, active: owner.active, aliases: [email, name.toLowerCase()] });
      console.log('         aliases now:', (getStaffByHandle('nadeem').aliases || []).join(', '));
    }
    skipped++;
    continue;
  }

  if (SKIP_EMAILS.test(email)) {
    console.log(`  SKIP   ${name} <${email}> (test account)`);
    skipped++;
    continue;
  }

  const role = u.role === 'admin' ? 'admin' : 'member';   // exactly one owner: "nadeem"
  if (DRY) {
    console.log(`  IMPORT ${name} <${email}> role=${role} teams=${teamIds.length} uid=${doc.id}`);
  } else {
    const rec = importStaff({ handle: name, name, uid: doc.id, role, teamIds, aliases: [email] });
    console.log(`  IMPORT ${rec.handle} <${email}> role=${rec.role} uid=${rec.uid}`);
  }
  imported++;
}

console.log('\n=== SUMMARY ===');
console.log('  imported:', imported);
console.log('  aliased to owner:', skipped);
console.log('  staff now:', listStaff().length);
console.log(DRY ? 'DRY RUN — nothing written.' : 'Applied.');
process.exit(0);
