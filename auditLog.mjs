// ============================================================================
// 🗂️ AUDIT LOG — one place for "who did what, why, with which model, at what cost"
// ============================================================================
// Stored per staff member in agents/{id}/auditLog (subcollection => no 1 MB doc limit)
// plus a compact global feed in appData/auditFeed for the dashboard.
// Never write secrets, API keys, passcodes or full phone numbers here.
// ============================================================================
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

let auditDb = null;
export function attachAuditDb(db) { if (db) auditDb = db; }

const sstr = (v, n = 500) => String(v == null ? '' : v).slice(0, n);

// Mask phone-like runs and secret-looking strings before anything is stored.
export function scrub(text) {
  return sstr(text, 1000)
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, '[key]')
    .replace(/\b(\+?\d{9,15})\b/g, (m) => m.slice(0, 4) + '***' + m.slice(-2))
    .replace(/\b(passcode|password|token)\s*[:=]\s*\S+/gi, '$1: [redacted]');
}

export async function audit(agentId, entry = {}) {
  if (!auditDb) return null;
  const row = {
    action: sstr(entry.action, 60) || 'event',
    summary: scrub(entry.summary),
    reason: scrub(entry.reason),
    model: sstr(entry.model, 60),
    chat: sstr(entry.chat, 100),
    riskLevel: Number(entry.riskLevel) || 0,
    status: sstr(entry.status, 40) || 'ok',
    tokensIn: Number(entry.tokensIn) || 0,
    tokensOut: Number(entry.tokensOut) || 0,
    costUsd: Number(entry.costUsd) || 0,
    meta: entry.meta ? JSON.parse(scrub(JSON.stringify(entry.meta))) : null,
    createdAt: Date.now()
  };
  try {
    if (agentId) await addDoc(collection(auditDb, 'agents', agentId, 'auditLog'), row);
    const ref = doc(auditDb, 'appData', 'auditFeed');
    const snap = await getDoc(ref);
    const items = snap.exists() ? (snap.data().items || []) : [];
    items.push({ agentId: sstr(agentId, 80), ...row });
    await setDoc(ref, { items: items.slice(-200) }, { merge: true });
  } catch (e) { /* auditing must never break a reply */ }
  return row;
}

export async function listAudit(agentId, { q = '', max = 80 } = {}) {
  if (!auditDb) return [];
  try {
    const snap = await getDocs(query(collection(auditDb, 'agents', agentId, 'auditLog'), orderBy('createdAt', 'desc'), limit(max)));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    if (!q) return out;
    const needle = q.toLowerCase();
    return out.filter(r => (r.action + ' ' + r.summary + ' ' + r.reason + ' ' + r.model + ' ' + r.chat).toLowerCase().includes(needle));
  } catch (e) { return []; }
}

export async function listGlobalFeed(max = 100) {
  if (!auditDb) return [];
  try {
    const snap = await getDoc(doc(auditDb, 'appData', 'auditFeed'));
    return snap.exists() ? (snap.data().items || []).slice(-max).reverse() : [];
  } catch (e) { return []; }
}
