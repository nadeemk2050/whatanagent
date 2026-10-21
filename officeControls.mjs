// ============================================================================
// 🛡️ OFFICE CONTROLS — decides, for every incoming message, what a staff member
// is ALLOWED to do. Pure logic + tiny counters, so it is easy to reason about.
// ============================================================================
// Decision actions:
//   reply    → normal auto-reply
//   draft    → generate but save as draft for boss approval (reuses brain draft flow)
//   alert    → do not reply, save alert for boss (observer mode / blocklist / silent)
//   fallback → hand this chat to the backup staff (usually Mr. Zaheer Ahmed)
//   pause    → stop entirely, escalate to boss (emergency stop / tripwire / hard limit)
// ============================================================================
import { doc, getDoc, setDoc } from 'firebase/firestore';

let ctlDb = null;
export function attachControlsDb(db) { if (db) ctlDb = db; }

const DEFAULT_STAFF_ID = 'zaheer';

// "09:00-18:00" → minutes. Bad input returns null.
function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
export function parseWindow(w) {
  const m = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(String(w || ''));
  if (!m) return null;
  const a = parseHM(m[1]), b = parseHM(m[2]);
  if (a == null || b == null) return null;
  return [a, b];
}
export function withinWindow(w, date = new Date()) {
  const win = parseWindow(w);
  if (!win) return true; // unparseable window = always open (backward compatible)
  const now = date.getHours() * 60 + date.getMinutes();
  const [a, b] = win;
  return a <= b ? (now >= a && now <= b) : (now >= a || now <= b); // supports overnight
}

const CRISIS_RE = /\b(suicide|kill myself|end my life|self[- ]?harm|overdose|خودکشی|مرنا چاہتا|جان دینا|زندگی ختم)\b/i;
const ANGER_RE = /\b(lawyer|court case|consumer court|refund now|scam|fraud|police|واپس کرو|دھوکہ|جھوٹ|رقم واپس)\b/i;
const MONEY_RE = /\b(price|rate|cost|invoice|payment|pay|bank|iban|account number|discount|قیمت|رقم|ادائیگی|بل)\b/i;
const DELETE_RE = /\b(delete|cancel my|remove my data|unsubscribe|بند کر دو|ڈیلیٹ)\b/i;

export function detectTripwire(text, cfg = {}) {
  const t = String(text || '');
  if (cfg.crisis !== false && CRISIS_RE.test(t)) return 'crisis';
  if (cfg.anger !== false && ANGER_RE.test(t)) return 'anger';
  return '';
}

export function needsApproval(kind, rules = {}) {
  const map = { money: 'money', deletion: 'deletion', bulkSend: 'bulkSend', newContact: 'newContacts', sensitive: 'sensitiveTopics' };
  const key = map[kind];
  return key ? rules[key] !== false : false;
}

function limitHit(staff) {
  const c = staff.controls || {};
  const u = staff.usageDaily || {};
  if (c.dailyMessageLimit && u.messages >= c.dailyMessageLimit) return 'daily_message_limit';
  if (c.dailyTokenLimit && u.tokens >= c.dailyTokenLimit) return 'daily_token_limit';
  if (c.dailyCostLimitUsd && u.costUsd >= c.dailyCostLimitUsd) return 'daily_cost_limit';
  return '';
}

// staff may be null. brain may be null (no brain card yet → default behaviour).
export function evaluateReplyPolicy({ staff, brain, incoming, now = new Date() }) {
  if (!staff) return { action: 'fallback', staffId: DEFAULT_STAFF_ID, reason: 'staff_missing' };
  const isDefault = !!staff.isDefault;
  const s = String(incoming || '');

  if (staff.emergencyStop) {
    return isDefault
      ? { action: 'pause', staffId: staff.id, reason: 'emergency_stop' }
      : { action: 'fallback', staffId: staff.id, reason: 'emergency_stop' };
  }

  const c = staff.controls || {};
  const jid = brain && brain.jid ? String(brain.jid) : '';
  if (jid && (c.blockedContacts || []).includes(jid)) return { action: 'alert', staffId: staff.id, reason: 'contact_blocked' };
  if (jid && (c.allowedContacts || []).length && !(c.allowedContacts || []).includes(jid)) {
    return { action: 'fallback', staffId: staff.id, reason: 'contact_not_allowed' };
  }

  const trip = detectTripwire(s, c.tripwires || {});
  if (trip) return { action: 'pause', staffId: staff.id, reason: 'tripwire_' + trip };
  const badTopic = (c.blockedTopics || []).find(t => t && s.toLowerCase().includes(String(t).toLowerCase()));
  if (badTopic) return { action: 'pause', staffId: staff.id, reason: 'blocked_topic' };

  const over = limitHit(staff);
  if (over) return isDefault ? { action: 'pause', staffId: staff.id, reason: over } : { action: 'fallback', staffId: staff.id, reason: over };

  const outsideHours = !withinWindow(c.workingHours, now) || (c.quietHours && withinWindow(c.quietHours, now));
  if (outsideHours && !c.outOfHoursAutoReply) return { action: 'draft', staffId: staff.id, reason: 'outside_hours' };

  if (staff.autonomy === 'observer') return { action: 'alert', staffId: staff.id, reason: 'observer_mode' };
  if (staff.autonomy === 'draft') return { action: 'draft', staffId: staff.id, reason: 'draft_mode' };
  if (c.dryRun) return { action: 'draft', staffId: staff.id, reason: 'dry_run' };

  const score = Number(brain && brain.confidence != null ? brain.confidence : staff.confidence || 0);
  const gate = Number(c.confidenceThreshold) || 0;
  if (gate > 0 && score > 0 && score < gate) return { action: 'fallback', staffId: staff.id, reason: 'low_confidence_' + score };

  // Per-chat brain mode still wins (existing behaviour kept).
  const mode = brain && brain.mode;
  if (mode === 'silent' || mode === 'alert_only') return { action: 'alert', staffId: staff.id, reason: mode };
  if (mode === 'draft_only') return { action: 'draft', staffId: staff.id, reason: 'draft_only' };

  return { action: 'reply', staffId: staff.id, reason: 'ok' };
}

// Counter used by limits. Cheap merge write, failure-tolerant.
export async function recordUsage(agentId, { messages = 0, tokens = 0, costUsd = 0 } = {}) {
  if (!ctlDb || !agentId) return;
  const today = new Date().toISOString().slice(0, 10);
  const ref = doc(ctlDb, 'agents', agentId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const u = snap.data().usageDaily || {};
    const base = u.date === today ? u : { date: today, messages: 0, tokens: 0, costUsd: 0 };
    await setDoc(ref, {
      usageDaily: {
        date: today,
        messages: (Number(base.messages) || 0) + messages,
        tokens: (Number(base.tokens) || 0) + tokens,
        costUsd: Math.round(((Number(base.costUsd) || 0) + costUsd) * 1e6) / 1e6
      }
    }, { merge: true });
  } catch (e) { /* counters must never break replies */ }
}
