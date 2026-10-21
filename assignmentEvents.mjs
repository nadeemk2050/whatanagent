// ============================================================================
// 🔁 ASSIGNMENT SYNC — assignmentEvents (source of truth) → agents/{id}/clients
// ============================================================================
// The brain card is the single source of truth for who handles a chat. Every change
// emits an event here; the per-staff read model is rebuilt from those events, so it
// can never silently drift. Rebuild with rebuildClients(agentId).
// ============================================================================
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, orderBy, limit, deleteDoc } from 'firebase/firestore';

let evDb = null;
export function attachAssignmentDb(db) { if (db) evDb = db; }

export const ASSIGNMENT_EVENTS = 'assignmentEvents';

const sstr = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
export const clientKey = (jid) => sstr(jid, 80).replace(/[^a-zA-Z0-9._@:-]/g, '_');

// One event per change. shape: {chatJid, chatName, type, staffId, previousStaffId, role, autonomy, assignedBy, note}
export async function emitAssignmentEvent(e = {}) {
  if (!evDb) return null;
  const row = {
    chatJid: sstr(e.chatJid, 100),
    chatName: sstr(e.chatName, 100) || 'Chat',
    type: e.type === 'group' ? 'group' : 'person',
    staffId: sstr(e.staffId, 80),
    previousStaffId: sstr(e.previousStaffId, 80),
    role: e.role === 'backup' ? 'backup' : 'primary',
    autonomy: ['observer', 'draft', 'auto'].includes(e.autonomy) ? e.autonomy : 'auto',
    assignedBy: sstr(e.assignedBy, 40) || 'boss',
    note: sstr(e.note, 200),
    at: Date.now()
  };
  if (!row.chatJid) return null;
  try {
    await addDoc(collection(evDb, ASSIGNMENT_EVENTS), row);
    await syncClientFromEvent(row);
  } catch (err) { console.warn('[ASSIGN] event failed:', err.message); }
  return row;
}

async function syncClientFromEvent(row) {
  if (!evDb) return;
  if (row.previousStaffId && row.previousStaffId !== row.staffId) {
    await deleteDoc(doc(evDb, 'agents', row.previousStaffId, 'clients', clientKey(row.chatJid))).catch(() => {});
  }
  if (!row.staffId) {
    await deleteDoc(doc(evDb, 'agents', row.role === 'backup' ? '' : row.previousStaffId || 'x', 'clients', clientKey(row.chatJid))).catch(() => {});
    return;
  }
  const key = clientKey(row.chatJid);
  const ref = doc(evDb, 'agents', row.staffId, 'clients', key);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  await setDoc(ref, {
    jid: row.chatJid,
    name: row.chatName,
    type: row.type,
    role: row.role,
    autonomy: row.autonomy,
    assignedBy: row.assignedBy,
    assignedAt: prev.assignedAt || row.at,
    updatedAt: row.at,
    lastActivity: prev.lastActivity || 0,
    openTasks: prev.openTasks || 0,
    note: row.note || prev.note || '',
    briefing: prev.briefing || null
  }, { merge: true });
}

export async function listClients(agentId) {
  if (!evDb) return [];
  try {
    const snap = await getDocs(query(collection(evDb, 'agents', agentId, 'clients'), orderBy('updatedAt', 'desc'), limit(300)));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch (e) { return []; }
}

export async function getClient(agentId, jid) {
  if (!evDb) return null;
  try {
    const snap = await getDoc(doc(evDb, 'agents', agentId, 'clients', clientKey(jid)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { return null; }
}

export async function patchClient(agentId, jid, patch = {}) {
  if (!evDb) return null;
  const key = clientKey(jid);
  await setDoc(doc(evDb, 'agents', agentId, 'clients', key), { ...patch, updatedAt: Date.now() }, { merge: true });
  return getClient(agentId, jid);
}

export async function touchClientActivity(agentId, jid, name, type) {
  if (!evDb || !agentId || !jid) return;
  try {
    await setDoc(doc(evDb, 'agents', agentId, 'clients', clientKey(jid)), {
      jid, name: sstr(name, 100) || 'Chat', type: type === 'group' ? 'group' : 'person', lastActivity: Date.now()
    }, { merge: true });
  } catch (e) { /* non-fatal */ }
}

// Rebuild the read model for one staff member from the event log.
export async function rebuildClients(agentId) {
  if (!evDb) return [];
  const snap = await getDocs(query(collection(evDb, ASSIGNMENT_EVENTS), orderBy('at', 'asc'), limit(1000)));
  const events = [];
  snap.forEach(d => events.push(d.data()));
  const mine = events.filter(e => e.staffId === agentId || e.previousStaffId === agentId);

  // Rebuild by replaying the latest event per chat.
  const latest = new Map();
  for (const e of events) {
    latest.set(e.chatJid, e);
  }
  const existing = await listClients(agentId);
  for (const c of existing) {
    const l = latest.get(c.jid);
    if (!l || l.staffId !== agentId) {
      await deleteDoc(doc(evDb, 'agents', agentId, 'clients', clientKey(c.jid))).catch(() => {});
    }
  }
  for (const e of latest.values()) {
    if (e.staffId === agentId) await syncClientFromEvent({ ...e, previousStaffId: '' });
  }
  return listClients(agentId);
}

export async function listEvents({ max = 100, jid = '' } = {}) {
  if (!evDb) return [];
  try {
    const snap = await getDocs(query(collection(evDb, ASSIGNMENT_EVENTS), orderBy('at', 'desc'), limit(max)));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return jid ? out.filter(e => e.chatJid === jid) : out;
  } catch (e) { return []; }
}
