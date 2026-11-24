// ============================================================================
// 🧠 LLM TANK API — review queue for automatically learned knowledge
// ============================================================================
//   GET  /api/llm-tank/status
//   GET  /api/llm-tank/candidates?status=pending|approved|rejected|all
//   POST /api/llm-tank/candidates/:id/approve
//   POST /api/llm-tank/candidates/:id/reject
//   POST /api/llm-tank/distill        { jid, name, transcript }
//   POST /api/llm-tank/run            { force?, maxChats? }
//
// Every route is admin-guarded (fail-closed): without ADMIN_TOKEN configured they
// refuse to serve rather than run open.
// ============================================================================
import { makeAdminGuard } from './adminGuard.mjs';
import { isAiAutoFetchStopped } from './aiTracker.mjs';
import {
  attachLlmTankDb, listCandidates, approveCandidate, rejectCandidate,
  learnFromTranscript, runNightly
} from './llmTank.mjs';

export function registerLlmTankRoutes(app, db) {
  attachLlmTankDb(db);
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'llm-tank' });

  app.get('/api/llm-tank/status', guard, async (req, res) => {
    try {
      const pending = await listCandidates({ status: 'pending' });
      res.json({
        ok: true,
        pending: pending.length,
        paused: isAiAutoFetchStopped(),
        hasOpenAiKey: !!process.env.OPENAI_API_KEY,
        autoPublish: /^(1|true|yes|on)$/i.test(String(process.env.LLM_TANK_AUTO_PUBLISH || ''))
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/llm-tank/candidates', guard, async (req, res) => {
    try {
      const status = String(req.query.status || 'pending');
      const candidates = await listCandidates({ status });
      res.json({ ok: true, count: candidates.length, candidates });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/llm-tank/candidates/:id/approve', guard, async (req, res) => {
    try {
      const item = await approveCandidate(String(req.params.id || ''));
      res.json({ ok: true, candidate: item });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/llm-tank/candidates/:id/reject', guard, async (req, res) => {
    try {
      const item = await rejectCandidate(String(req.params.id || ''));
      res.json({ ok: true, candidate: item });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/llm-tank/distill', guard, async (req, res) => {
    try {
      const { jid = '', name = '', transcript = '' } = req.body || {};
      if (!String(transcript || '').trim()) return res.status(400).json({ error: 'transcript is required' });
      const result = await learnFromTranscript({ jid, name, transcript });
      res.json({ ok: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/llm-tank/run', guard, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await runNightly({ force: body.force === true, maxChats: Number(body.maxChats) || 6 });
      res.json({ ok: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Called from the 60-second scheduler; runNightly() itself is throttled to ~once a day.
  return {
    maybeRun: () => runNightly().catch(e => console.warn('[LLM TANK] nightly failed:', String(e.message || e).slice(0, 140)))
  };
}
