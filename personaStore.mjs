// ============================================================================
// 🎭 PERSONA / VOICE — one editable voice for all AI, plus per-agent overrides
// ============================================================================
// Default text lives in personaStyle.mjs (HUMAN_WARM_SALES_STYLE). The owner can
// replace it from the Staff Academy without a deploy:
//   appData/personaVoice      { text, updatedAt }        global voice
//   agents/{id}.personaVoice  string                     one agent's override
//
// Resolution:
//   agent.personaVoice  (if set)          -> used for that agent
//   else business/default agent           -> the global voice
//   else specialist agent                 -> its own card tone (unchanged)
//
// WhatsApp replies always get the global voice; the per-contact Brain can still
// fine-tune the tone for one person.
// ============================================================================
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { HUMAN_WARM_SALES_STYLE, usesHumanWarmStyle } from './personaStyle.mjs';
import { getAgent, updateAgent } from './agentsStore.mjs';
import { makeAdminGuard } from './adminGuard.mjs';

const DOC = ['appData', 'personaVoice'];
const MAX = 8000;

let db = null;
let cache = { at: 0, text: '' };
const CACHE_MS = 60 * 1000;

export function attachPersonaDb(database) { if (database) db = database; }

/** The owner's custom global voice, or the built-in HUMAN CORE. */
export async function getGlobalPersonaText() {
  if (!db) return HUMAN_WARM_SALES_STYLE;
  if (cache.text && (Date.now() - cache.at) < CACHE_MS) return cache.text;
  try {
    const snap = await getDoc(doc(db, DOC[0], DOC[1]));
    const text = snap.exists() ? String((snap.data() || {}).text || '').trim().slice(0, MAX) : '';
    cache = { at: Date.now(), text: text || HUMAN_WARM_SALES_STYLE };
    return cache.text;
  } catch (e) {
    return HUMAN_WARM_SALES_STYLE;
  }
}

export async function getGlobalPersonaState() {
  const text = await getGlobalPersonaText();
  return { text, isDefault: text === HUMAN_WARM_SALES_STYLE, defaultText: HUMAN_WARM_SALES_STYLE };
}

export async function saveGlobalPersonaText(text) {
  if (!db) throw new Error('Storage unavailable');
  const clean = String(text == null ? '' : text).slice(0, MAX);
  await setDoc(doc(db, DOC[0], DOC[1]), { text: clean, updatedAt: Date.now() }, { merge: true });
  cache = { at: Date.now(), text: clean || HUMAN_WARM_SALES_STYLE };
  return getGlobalPersonaState();
}

export async function resetGlobalPersona() {
  return saveGlobalPersonaText('');
}

/**
 * What this agent should receive:
 *   own override  -> that text
 *   business/default -> the global voice
 *   specialist    -> '' (its card tone is kept, no sales voice)
 */
export async function getEffectivePersonaForAgent(agent) {
  const own = String((agent && agent.personaVoice) || '').trim();
  if (own) return own.slice(0, MAX);
  if (usesHumanWarmStyle(agent)) return getGlobalPersonaText();
  return '';
}

export function registerPersonaRoutes(app, { adminToken } = {}) {
  const guard = makeAdminGuard({ adminToken, label: 'persona' });

  app.get('/api/persona', guard, async (req, res) => {
    try { res.json({ ok: true, ...(await getGlobalPersonaState()) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/persona', guard, async (req, res) => {
    try { res.json({ ok: true, ...(await saveGlobalPersonaText((req.body || {}).text)) }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });

  app.post('/api/persona/reset', guard, async (req, res) => {
    try { res.json({ ok: true, ...(await resetGlobalPersona()) }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });

  app.get('/api/persona/agent/:id', guard, async (req, res) => {
    try {
      const agent = await getAgent(req.params.id, { fresh: false });
      if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found' });
      res.json({
        ok: true,
        text: String(agent.personaVoice || ''),
        globalText: await getGlobalPersonaText(),
        inherits: !String(agent.personaVoice || '').trim()
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/persona/agent/:id', guard, async (req, res) => {
    try {
      const text = String((req.body || {}).text == null ? '' : (req.body || {}).text).slice(0, MAX);
      const agent = await updateAgent(req.params.id, { personaVoice: text });
      res.json({ ok: true, text: String((agent && agent.personaVoice) || ''), inherits: !text.trim() });
    } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
}
