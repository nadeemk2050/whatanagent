// ============================================================================
// AlignTasks 2.0 migration — create Team #1 and stamp `teamId` on board data.
//
//  • Teams are stored at  artifacts/<appId>/public/data/teams/{teamId}
//  • Every board document gets a `teamId` field so each team only sees its own
//    tasks / projects / members / comments.
//  • Existing users get: teamIds[], teamRoles{}, defaultTeamId
//  • Legacy fields (ownerAdminUid/ownerAdminEmail, role:'admin'|'user') are KEPT
//    so anything still reading them keeps working.
//
// Usage:
//   node scripts/migrate-align-teams.mjs --dry          (report only, no writes)
//   node scripts/migrate-align-teams.mjs --apply        (write)
//   node scripts/migrate-align-teams.mjs --apply --owner you@example.com
//   node scripts/migrate-align-teams.mjs --revert       (remove the added fields)
// ============================================================================
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteField, serverTimestamp
} from 'firebase/firestore';

const cfg = {
  apiKey: 'AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI',
  authDomain: 'whatanagent-a1e59.firebaseapp.com',
  projectId: 'whatanagent-a1e59',
  storageBucket: 'whatanagent-a1e59.firebasestorage.app',
  messagingSenderId: '410197132578',
  appId: '1:410197132578:web:97cfc3ae33f39ed3df917b'
};
const APPID = cfg.appId;
const BASE = `artifacts/${APPID}/public/data`;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const APPLY = args.includes('--apply');
const REVERT = args.includes('--revert');
const ownerArg = (() => { const i = args.indexOf('--owner'); return i >= 0 ? String(args[i + 1] || '').toLowerCase() : ''; })();

const app = initializeApp(cfg);
const db = getFirestore(app);

const log = (...a) => console.log(...a);
const col = (path) => collection(db, path);

async function loadAll(path) {
  const snap = await getDocs(col(path));
  return snap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() || {} }));
}

async function pickOwner(users) {
  if (ownerArg) {
    const hit = users.find(u => String(u.data.email || '').toLowerCase() === ownerArg);
    if (!hit) throw new Error(`No board user with email ${ownerArg}`);
    return hit;
  }
  const admins = users.filter(u => String(u.data.role || '') === 'admin');
  if (admins.length === 1) return admins[0];
  if (admins.length > 1) {
    admins.sort((a, b) => Number(a.data.createdAt?.seconds || 0) - Number(b.data.createdAt?.seconds || 0));
    log(`⚠️  ${admins.length} legacy admins found — using the oldest: ${admins[0].data.email}`);
    return admins[0];
  }
  if (users.length === 1) return users[0];
  throw new Error('Could not determine the owner. Re-run with --owner <email>');
}

async function findOrCreateTeam(owner) {
  const teams = await loadAll(`${BASE}/teams`);
  let team = teams.find(t => t.data.ownerUid === owner.id) || teams.find(t => t.data.settings && t.data.settings.isPrimary === true);
  if (team) { log(`Team found: ${team.id} — "${team.data.name}"`); return team.id; }

  const name = String(owner.data.name || String(owner.data.email || '').split('@')[0]) + "'s Team";
  if (DRY) { log(`[dry] would create team "${name}" owned by ${owner.data.email}`); return 'DRY-TEAM-ID'; }

  const teamRef = doc(col(`${BASE}/teams`));
  await setDoc(teamRef, {
    name,
    ownerUid: owner.id,
    ownerEmail: String(owner.data.email || '').toLowerCase(),
    createdAt: serverTimestamp(),
    createdBy: String(owner.data.email || '').toLowerCase(),
    migratedFrom: 'legacy-flat-data',
    settings: { reminderMode: 'handoff', isPrimary: true }
  });
  log(`✅ Team created: ${teamRef.id} — "${name}"`);
  return teamRef.id;
}

async function migrateUsers(users, owner, teamId) {
  let changed = 0;
  for (const u of users) {
    const d = u.data || {};
    const email = String(d.email || '').toLowerCase();
    const isOwner = u.id === owner.id || (d.role === 'admin' && !ownerArg);
    // NOTE: the legacy `role` field is deliberately NOT changed here. The currently deployed
    // 1.5 app still checks role === 'admin' for admin powers, so it must stay 'admin'/'user'
    // until the 2.0 client is live. Team membership lives in teamIds/teamRoles.
    const patch = {
      teamIds: [teamId],
      teamRoles: { [teamId]: isOwner ? 'owner' : 'member' },
      defaultTeamId: teamId
    };
    const already = Array.isArray(d.teamIds) && d.teamIds.includes(teamId) && d.teamRoles && d.teamRoles[teamId];
    if (already) continue;
    changed++;
    log(`   user ${email || u.id} → ${isOwner ? 'owner' : 'member'}`);
    if (!DRY) await setDoc(u.ref, patch, { merge: true });
  }
  return changed;
}

async function migrateCollection(path, teamId, label) {
  const rows = await loadAll(path);
  let n = 0;
  for (const r of rows) {
    if (r.data.teamId) continue;
    n++;
    if (!DRY) await updateDoc(r.ref, { teamId });
  }
  log(`${label}: ${rows.length} docs, ${n} ${DRY ? 'would be' : ''} stamped`);
  return n;
}

async function revert(users) {
  const paths = ['tasks', 'tasks_for_all', 'projects', 'staff'];
  for (const p of paths) {
    const rows = await loadAll(`${BASE}/${p}`);
    let n = 0;
    for (const r of rows) {
      if (!r.data.teamId) continue;
      n++;
      await updateDoc(r.ref, { teamId: deleteField() });
    }
    log(`revert ${p}: ${n} docs cleared`);
  }
  const projects = await loadAll(`${BASE}/projects`);
  for (const p of projects) {
    const rows = await loadAll(`${BASE}/projects/${p.id}/tasks`);
    for (const r of rows) if (r.data.teamId) await updateDoc(r.ref, { teamId: deleteField() });
  }
  for (const u of users) {
    await updateDoc(u.ref, { teamIds: deleteField(), teamRoles: deleteField(), defaultTeamId: deleteField() });
  }
  log('revert: user team fields cleared (team documents themselves were left in place)');
}

async function main() {
  if (!DRY && !APPLY && !REVERT) {
    log('Nothing to do. Pass --dry (report), --apply (write) or --revert (undo).');
    return;
  }
  log(`Project ${cfg.projectId} · base ${BASE}`);
  log(`Mode: ${REVERT ? 'REVERT' : (DRY ? 'DRY RUN' : 'APPLY')}\n`);

  const users = await loadAll(`${BASE}/users`);
  log(`Board users: ${users.length}`);

  if (REVERT) { await revert(users); log('\nRevert complete.'); return; }

  const owner = await pickOwner(users);
  log(`Owner: ${owner.data.email || owner.id} (${owner.id})`);

  const teamId = await findOrCreateTeam(owner);
  log(`Team id: ${teamId}\n`);

  let total = 0;
  total += await migrateCollection(`${BASE}/tasks`, teamId, 'tasks');
  total += await migrateCollection(`${BASE}/tasks_for_all`, teamId, 'tasks_for_all');
  total += await migrateCollection(`${BASE}/projects`, teamId, 'projects');
  total += await migrateCollection(`${BASE}/staff`, teamId, 'staff');

  // project subcollection tasks
  const projects = await loadAll(`${BASE}/projects`);
  for (const p of projects) {
    total += await migrateCollection(`${BASE}/projects/${p.id}/tasks`, teamId, `projects/${p.id}/tasks`);
  }

  const userChanges = await migrateUsers(users, owner, teamId);

  log(`\nSummary: ${total} board docs ${DRY ? 'to stamp' : 'stamped'}, ${userChanges} user profile(s) ${DRY ? 'to update' : 'updated'}`);
  if (DRY) log('\nThis was a DRY RUN — nothing was written. Re-run with --apply to migrate.');
  else log('\n✅ Migration applied. Open /aligntasks/ and check Team #1 shows your existing board.');
  process.exit(0);
}

main().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
