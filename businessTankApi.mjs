// ============================================================================
// 🧠 BUSINESS DATA TANK — API routes (fail-closed admin guard)
// ============================================================================
import { makeAdminGuard } from './adminGuard.mjs';
import {
  attachBusinessDb, SECTIONS, getState, saveSection, completeness, addFile, getFileText,
  deleteFile, buildDigest, previewText
} from './businessTank.mjs';
import { listAgents, updateAgent } from './agentsStore.mjs';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export function registerBusinessRoutes(app, db) {
  attachBusinessDb(db);
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'business' });
  const api = '/api/business';
  app.use(api, guard);
  console.log('[TANK] 🧠 Business Data Tank API registered');

  const fail = (res, e, code = 500) => res.status(code).json({ ok: false, error: e && e.message ? e.message : String(e) });

  app.get(api, async (req, res) => {
    try {
      const st = await getState({ fresh: req.query.fresh === '1' });
      const agents = (await listAgents()).filter(a => a.status !== 'archived');
      res.json({
        ok: true,
        sections: SECTIONS,
        data: st.data,
        files: st.files,
        digest: st.digest,
        updatedAt: st.updatedAt,
        completeness: completeness(st),
        staff: agents.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, role: a.role, linked: !!a.useBusinessTank }))
      });
    } catch (e) { fail(res, e); }
  });

  app.put(api + '/section/:id', async (req, res) => {
    try {
      const saved = await saveSection(req.params.id, (req.body || {}).value);
      const st = await getState();
      res.json({ ok: true, saved, updatedAt: st.updatedAt, completeness: completeness(st) });
    } catch (e) { fail(res, e, /Unknown section/.test(e.message) ? 404 : 500); }
  });

  app.post(api + '/file', async (req, res) => {
    try {
      const b = req.body || {};
      const name = String(b.name || '').slice(0, 200);
      if (!name || !b.dataBase64) return fail(res, new Error('Send { name, dataBase64 }.'), 400);
      const buf = Buffer.from(String(b.dataBase64), 'base64');
      if (!buf.length) return fail(res, new Error('The file is empty.'), 400);
      if (buf.length > MAX_UPLOAD_BYTES) return fail(res, new Error('File is larger than 12 MB.'), 413);
      const meta = await addFile({ name, mime: String(b.mime || ''), buf });
      res.json({ ok: true, file: meta });
    } catch (e) { fail(res, e, 400); }
  });

  app.get(api + '/file/:id', async (req, res) => {
    try {
      const f = await getFileText(req.params.id);
      if (!f) return fail(res, new Error('File not found.'), 404);
      res.json({ ok: true, ...f });
    } catch (e) { fail(res, e); }
  });

  app.delete(api + '/file/:id', async (req, res) => {
    try { await deleteFile(req.params.id); res.json({ ok: true }); } catch (e) { fail(res, e); }
  });

  app.post(api + '/digest', async (req, res) => {
    try {
      const digest = await buildDigest();
      res.json({ ok: true, digest });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/preview', (req, res) => {
    res.json({ ok: true, text: previewText() });
  });

  app.post(api + '/link', async (req, res) => {
    try {
      const { agentId, on } = req.body || {};
      if (!agentId) return fail(res, new Error('agentId is required.'), 400);
      const agent = await updateAgent(String(agentId), { useBusinessTank: !!on });
      res.json({ ok: true, agentId, linked: !!(agent && agent.useBusinessTank) });
    } catch (e) { fail(res, e); }
  });
}
