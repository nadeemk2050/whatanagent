// ============================================================================
// 📥 WHATSAPP TASK FETCH GROUP — one group whose messages become board tasks
// ============================================================================
// Config doc: appData/alignTaskFetchGroup
//   { enabled, jid, name, updatedAt, updatedBy }
//
// A message (typed or forwarded) in that group becomes a task in the board's
// "tasks_for_all" list with createdBy = 'wtasksfg'. The config is cached briefly
// so group traffic does not hit Firestore on every message; saving invalidates it.
// ============================================================================
import { alignDb } from './alignAdmin.mjs';

const DOC = 'appData/alignTaskFetchGroup';
const CACHE_MS = 10000;
const EMPTY = { enabled: false, jid: '', name: '', updatedAt: 0 };

let cache = { at: 0, value: { ...EMPTY } };

export async function getFetchGroupConfig() {
  if (Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const snap = await alignDb().doc(DOC).get();
    const v = snap.exists ? (snap.data() || {}) : {};
    cache = {
      at: Date.now(),
      value: {
        enabled: !!v.enabled,
        jid: String(v.jid || ''),
        name: String(v.name || ''),
        updatedAt: Number(v.updatedAt) || 0
      }
    };
  } catch (e) {
    cache = { at: Date.now(), value: { ...EMPTY } };
  }
  return cache.value;
}

export async function setFetchGroupConfig({ enabled, jid, name } = {}, by = '') {
  const value = {
    enabled: !!enabled,
    jid: String(jid || '').trim(),
    name: String(name || '').trim().slice(0, 160),
    updatedAt: Date.now(),
    updatedBy: String(by || '').slice(0, 160)
  };
  await alignDb().doc(DOC).set(value, { merge: true });
  cache = { at: Date.now(), value };
  return value;
}
