// ============================================================================
// 📖 RULE BOOK — API routes (fail-closed admin guard)
// ============================================================================
import { makeAdminGuard } from './adminGuard.mjs';
import { attachRuleBookDb, getRuleBook, saveRuleBook, DEFAULT_RULES, LOCKED_RULES, enforceScript, devanagariToRoman, hasDevanagari } from './ruleBook.mjs';

const sstr = (v, n = 2000) => String(v == null ? '' : v).slice(0, n);

export function registerRuleBookRoutes(app, db) {
  attachRuleBookDb(db);
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'rules' });
  const api = '/api/rules';
  app.use(api, guard);
  console.log('[RULEBOOK] 📖 Rule Book API registered');

  app.get(api, async (req, res) => {
    try {
      const book = await getRuleBook({ fresh: req.query.fresh === '1' });
      res.json({ ok: true, rules: book.rules, updatedAt: book.updatedAt, lockedNotice: LOCKED_RULES });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api, async (req, res) => {
    try {
      const rules = Array.isArray((req.body || {}).rules) ? req.body.rules : null;
      if (!rules) return res.status(400).json({ ok: false, error: 'Send { rules: [...] }.' });
      const bad = rules.find(r => !sstr(r.title, 200).trim() || !sstr(r.text, 2000).trim());
      if (bad) return res.status(400).json({ ok: false, error: 'Every rule needs a title and text.' });
      const saved = await saveRuleBook(rules, { by: 'boss' });
      res.json({ ok: true, ...saved });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/reset', async (req, res) => {
    try {
      const saved = await saveRuleBook(DEFAULT_RULES.map(r => ({ ...r })), { by: 'boss' });
      res.json({ ok: true, ...saved });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Live demo of the script guard so the boss can see exactly what will be converted.
  app.post(api + '/test-script', (req, res) => {
    try {
      const text = sstr((req.body || {}).text, 2000);
      const out = enforceScript(text);
      res.json({ ok: true, before: text, after: out.text, changed: out.changed, hadDevanagari: hasDevanagari(text) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
