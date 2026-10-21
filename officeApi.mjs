// ============================================================================
// 🏢 OFFICES OF STAFF — API routes
// ============================================================================
// Registered from index.js via registerOfficeRoutes(app, db).
// Every route is behind the SAME fail-closed admin guard as the Academy
// (no ADMIN_TOKEN on the server → 503, wrong token → 401).
//
// Route map
//   GET  /api/office/offices                    office cards (counts, health)
//   GET  /api/office/dashboard                  global board
//   GET  /api/office/tools/catalog              tool catalogue with risk levels
//   GET  /api/office/meetings                   list staff meetings
//   POST /api/office/meetings                   open a meeting
//   GET  /api/office/meetings/:mid
//   POST /api/office/meetings/:mid/run
//   POST /api/office/meetings/:mid/save
//   GET  /api/office/reports/:range             daily / weekly report
//   GET  /api/office/:id                        full office detail
//   POST /api/office/:id/stop                   emergency stop on/off
//   POST /api/office/:id/autonomy               observer | draft | auto
//   POST /api/office/:id/controls               limits, hours, lists, tripwires
//   POST /api/office/:id/team                   cover / supervisor / consult
//   POST /api/office/:id/tools                  tool set + level-4 opt-in
//   GET  /api/office/:id/clients                My Clients
//   POST /api/office/:id/clients/:jid/note
//   POST /api/office/:id/clients/:jid/briefing  LLM handover briefing
//   POST /api/office/:id/clients/:jid/handover  reassign to another staff
//   GET  /api/office/:id/desk                   today's desk
//   GET  /api/office/:id/logs?q=
//   GET  /api/office/:id/performance
//   GET  /api/office/:id/complaints             complaint tracker
//   POST /api/office/:id/complaints
//   POST /api/office/:id/review                 self-review suggestions
//   POST /api/office/:id/advisor                ask Zaheer for advice (suggest only)
//   GET  /api/office/:id/model                  model + history
//   POST /api/office/:id/model/preview          compare before switching
//   POST /api/office/:id/model/apply
//   POST /api/office/:id/model/rollback
// ============================================================================
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { makeAdminGuard } from './adminGuard.mjs';
import {
  attachAgentsDb, listAgents, getAgent, updateAgent, addLesson,
  listTests, listTestRuns, listToolLogs, listFallbacks, computeProgress, computeConfidence,
  AVAILABLE_MODELS, listAgentSub, addAgentSub
} from './agentsStore.mjs';
import { attachToolDb, listTools, ROLE_TOOLSETS, RISK_LEVELS, toolLevel } from './toolRegistry.mjs';
import { attachAuditDb, audit, listAudit, listGlobalFeed } from './auditLog.mjs';
import { attachAssignmentDb, listClients, getClient, patchClient, rebuildClients, listEvents, emitAssignmentEvent, clientKey } from './assignmentEvents.mjs';
import { attachControlsDb, evaluateReplyPolicy, recordUsage } from './officeControls.mjs';
import { attachMeetingDb, createMeeting, listMeetings, getMeeting, runMeeting, saveMeetingOutcome, reopenMeeting } from './meetingRoom.mjs';
import { previewModelChange, applyModelChange, rollbackModel, listModelHistory, MODEL_OPTIONS, isSafetySensitive } from './modelSwitcher.mjs';
import { runAgent } from './agentRunner.mjs';
import { getBrain, saveBrain, listBrains } from './contactBrain.mjs';
import { attachLearningDb, listLearningRuns } from './agentLearning.mjs';

const sstr = (v, n = 400) => String(v == null ? '' : v).slice(0, n);
const bad = (res, msg) => res.status(400).json({ ok: false, error: msg });

let officeDb = null;

// Daily snapshot used by the scheduler in index.js (kept in appData/staffDailyReports).
export async function maybeStaffDailyReport() {
  if (!officeDb) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const ref = doc(officeDb, 'appData', 'staffDailyReports');
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : { items: [] };
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length && items[items.length - 1].date === today) return; // already done today
    const agents = await listAgents({ fresh: true });
    const rows = agents.map(a => ({
      id: a.id, name: a.name,
      messages: (a.usageDaily && a.usageDaily.date === today) ? a.usageDaily.messages : 0,
      costUsd: (a.usageDaily && a.usageDaily.date === today) ? a.usageDaily.costUsd : 0,
      stop: !!a.emergencyStop, autonomy: a.autonomy || 'auto', progress: computeProgress(a).effective
    }));
    items.push({ date: today, rows, at: Date.now() });
    await setDoc(ref, { items: items.slice(-30) }, { merge: true });
    console.log('[OFFICE] 📊 Daily staff report stored for ' + today);
  } catch (e) { console.warn('[OFFICE] daily report failed:', e.message); }
}

const AUTONOMY_LABELS = { observer: 'Observer', draft: 'Draft for approval', auto: 'Auto-reply' };

function healthOf(agent, fallbackCount = 0, complaintsOpen = 0, progressPct = null) {
  if (agent.emergencyStop) return { key: 'stopped', label: '⛔ Stopped', color: '#f85149' };
  if (agent.autonomy === 'observer') return { key: 'observer', label: '👀 Observer', color: '#8b949e' };
  if (fallbackCount >= 5 || complaintsOpen >= 3) return { key: 'attention', label: '⚠️ Needs attention', color: '#d29922' };
  const pct = progressPct == null ? (computeProgress(agent) || {}).effective || 0 : progressPct;
  if (pct < 40) return { key: 'learning', label: '📚 Learning', color: '#58a6ff' };
  return { key: 'healthy', label: '✅ Healthy', color: '#3fb950' };
}

export function registerOfficeRoutes(app, db) {
  officeDb = db;
  attachAgentsDb(db);
  attachToolDb(db);
  attachAuditDb(db);
  attachAssignmentDb(db);
  attachControlsDb(db);
  attachMeetingDb(db);
  attachLearningDb(db);

  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'office' });
  const api = '/api/office';
  app.use(api, guard);
  console.log('[OFFICE] 🏢 Offices of Staff API registered' + (process.env.ADMIN_TOKEN ? '' : ' — ADMIN_TOKEN MISSING, routes will return 503'));

  // ---------------------------------------------------------------- shared loaders
  async function officeRow(a) {
    const [clients, runs, fallbacks, complaints] = await Promise.all([
      listClients(a.id),
      listTestRuns(a.id).catch(() => []),
      listFallbacks(300).catch(() => []),
      listAgentSub(a.id, 'complaints', 50).catch(() => [])
    ]);
    const openComplaints = complaints.filter(c => c.status !== 'resolved').length;
    const fb24 = fallbacks.filter(f => (f.assigned || '') === a.id && (Date.now() - (f.at || 0)) < 86400000).length;
    const prog = computeProgress(a);
    return {
      id: a.id, name: a.name, role: a.role, emoji: a.emoji, gender: a.gender, category: a.category,
      status: a.status, isDefault: !!a.isDefault, isProtected: !!a.isProtected,
      autonomy: a.autonomy || 'auto', autonomyLabel: AUTONOMY_LABELS[a.autonomy || 'auto'],
      emergencyStop: !!a.emergencyStop, stoppedReason: a.stoppedReason || '', stoppedAt: a.stoppedAt || 0,
      model: a.model || '', progress: prog, confidence: computeConfidence(a),
      clients: clients.length, clientNames: clients.slice(0, 4).map(c => c.name),
      groups: clients.filter(c => c.type === 'group').length,
      usage: a.usageDaily || { messages: 0, tokens: 0, costUsd: 0 },
      lastRun: runs[0] ? { passRate: runs[0].passRate, at: runs[0].createdAt } : null,
      fallbacks24h: fb24, complaintsOpen: openComplaints,
      health: healthOf(a, fb24, openComplaints, prog.effective),
      tools: (a.allowedTools || []).length, level4: !!a.level4OptIn
    };
  }

  // ---------------------------------------------------------------- offices
  app.get(api + '/offices', async (req, res) => {
    try {
      const agents = await listAgents({ fresh: req.query.fresh === '1' });
      const rows = [];
      for (const a of agents) rows.push(await officeRow(a));
      // Zaheer's office always first.
      rows.sort((x, y) => (y.isDefault ? 1 : 0) - (x.isDefault ? 1 : 0) || String(x.name).localeCompare(String(y.name)));
      res.json({ ok: true, offices: rows, autonomyLabels: AUTONOMY_LABELS });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get(api + '/dashboard', async (req, res) => {
    try {
      const agents = await listAgents({ fresh: true });
      const rows = [];
      for (const a of agents) rows.push(await officeRow(a));
      const fallbacks = await listFallbacks(200).catch(() => []);
      res.json({
        ok: true,
        totals: {
          staff: rows.length,
          ready: rows.filter(r => r.status === 'ready').length,
          training: rows.filter(r => r.status === 'under_training').length,
          stopped: rows.filter(r => r.emergencyStop).length,
          chats: rows.reduce((n, r) => n + r.clients, 0),
          messagesToday: rows.reduce((n, r) => n + (r.usage.messages || 0), 0),
          costTodayUsd: Math.round(rows.reduce((n, r) => n + (r.usage.costUsd || 0), 0) * 1e4) / 1e4
        },
        offices: rows,
        fallbacks24h: fallbacks.filter(f => (Date.now() - (f.at || 0)) < 86400000).slice(0, 40),
        feed: await listGlobalFeed(40).catch(() => [])
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get(api + '/tools/catalog', (req, res) => {
    res.json({ ok: true, tools: listTools(), riskLevels: RISK_LEVELS, roleToolsets: ROLE_TOOLSETS });
  });

  // ---------------------------------------------------------------- meetings (before :id)
  app.get(api + '/meetings', async (req, res) => {
    try { res.json({ ok: true, meetings: await listMeetings({ max: 25 }) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/meetings', async (req, res) => {
    try {
      const b = req.body || {};
      const room = await createMeeting({
        topic: sstr(b.topic, 500),
        participants: Array.isArray(b.participants) ? b.participants : [],
        chairId: sstr(b.chairId, 80) || 'zaheer',
        scribeId: sstr(b.scribeId, 80),
        caps: b.caps || {}
      });
      res.json({ ok: true, meeting: room });
    } catch (e) { bad(res, e.message); }
  });

  app.get(api + '/meetings/:mid', async (req, res) => {
    try {
      const m = await getMeeting(req.params.mid);
      if (!m) return res.status(404).json({ ok: false, error: 'Meeting not found' });
      res.json({ ok: true, meeting: m });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/meetings/:mid/run', async (req, res) => {
    try {
      const out = await runMeeting(req.params.mid, { rounds: Number((req.body || {}).rounds) || null });
      res.json({ ok: true, ...out });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/meetings/:mid/save', async (req, res) => {
    try {
      const b = req.body || {};
      const out = await saveMeetingOutcome(req.params.mid, { kind: sstr(b.kind, 20) || 'lesson', staffId: sstr(b.staffId, 80), text: sstr(b.text, 4000) });
      res.json(out);
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/meetings/:mid/reopen', async (req, res) => {
    try { res.json(await reopenMeeting(req.params.mid)); }
    catch (e) { bad(res, e.message); }
  });

  // ---------------------------------------------------------------- reports
  app.get(api + '/reports/:range', async (req, res) => {
    try {
      const range = req.params.range === 'weekly' ? 'weekly' : 'daily';
      const days = range === 'weekly' ? 7 : 1;
      const since = Date.now() - days * 86400000;
      const agents = await listAgents({ fresh: true });
      const rows = [];
      for (const a of agents) {
        const clients = await listClients(a.id).catch(() => []);
        const runs = await listTestRuns(a.id).catch(() => []);
        const complaints = await listAgentSub(a.id, 'complaints', 50).catch(() => []);
        rows.push({
          id: a.id, name: a.name, role: a.role, emoji: a.emoji, stop: !!a.emergencyStop,
          autonomy: a.autonomy || 'auto',
          messages: (a.usageDaily && a.usageDaily.date >= new Date(since).toISOString().slice(0, 10)) ? a.usageDaily.messages : 0,
          tokens: a.usageDaily ? a.usageDaily.tokens : 0,
          costUsd: a.usageDaily ? a.usageDaily.costUsd : 0,
          clients: clients.filter(c => (c.updatedAt || 0) >= since).length,
          passRate: runs[0] && runs[0].createdAt >= since ? runs[0].passRate : null,
          complaints: complaints.filter(c => (c.createdAt || 0) >= since).length,
          openComplaints: complaints.filter(c => c.status !== 'resolved').length,
          confidence: computeConfidence(a), progress: computeProgress(a)
        });
      }
      const fallbacks = (await listFallbacks(300).catch(() => [])).filter(f => (f.at || 0) >= since);
      res.json({
        ok: true, range, days,
        rows, fallbacks: fallbacks.length,
        generatedAt: Date.now(),
        summary: {
          messages: rows.reduce((n, r) => n + r.messages, 0),
          costUsd: Math.round(rows.reduce((n, r) => n + r.costUsd, 0) * 1e4) / 1e4,
          complaints: rows.reduce((n, r) => n + r.complaints, 0),
          fallbacks: fallbacks.length
        }
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---------------------------------------------------------------- office detail
  app.get(api + '/:id', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const [clients, audits, runs, tools, history, complaints, fallbacks] = await Promise.all([
        listClients(a.id).catch(() => []),
        listAudit(a.id, { max: 40 }).catch(() => []),
        listTestRuns(a.id).catch(() => []),
        Promise.resolve(listTools()),
        listModelHistory(a.id).catch(() => []),
        listAgentSub(a.id, 'complaints', 50).catch(() => []),
        listFallbacks(300).catch(() => [])
      ]);
      const row = await officeRow(a);
      res.json({
        ok: true,
        office: row,
        agent: { ...a, progress: computeProgress(a), confidence: computeConfidence(a) },
        controls: a.controls || {},
        clients,
        audit: audits,
        runs: runs.slice(0, 8),
        tools: tools.map(t => ({ ...t, enabled: (a.allowedTools || []).includes(t.id) })),
        modelHistory: history,
        complaints,
        fallbacks: fallbacks.filter(f => (f.assigned || '') === a.id).slice(0, 20),
        roleToolsets: ROLE_TOOLSETS,
        riskLevels: RISK_LEVELS,
        models: MODEL_OPTIONS,
        safetySensitive: isSafetySensitive(a),
        autonomyLabels: AUTONOMY_LABELS
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---------------------------------------------------------------- controls
  app.post(api + '/:id/stop', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const b = req.body || {};
      const on = b.on !== false;
      await updateAgent(a.id, {
        emergencyStop: on,
        stoppedAt: on ? Date.now() : 0,
        stoppedReason: on ? (sstr(b.reason, 200) || 'Stopped by boss') : ''
      });
      await audit(a.id, {
        action: on ? 'emergency_stop' : 'emergency_resume',
        summary: (on ? 'Emergency stop ON' : 'Emergency stop OFF') + (b.reason ? ': ' + sstr(b.reason, 200) : ''),
        reason: sstr(b.reason, 200), status: on ? 'stopped' : 'ok'
      });
      res.json({ ok: true, emergencyStop: on });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/autonomy', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const autonomy = sstr((req.body || {}).autonomy, 20);
      if (!AUTONOMY_LABELS[autonomy]) return bad(res, 'Autonomy must be observer, draft or auto.');
      await updateAgent(a.id, { autonomy });
      await audit(a.id, { action: 'autonomy_change', summary: 'Autonomy set to ' + AUTONOMY_LABELS[autonomy], reason: 'boss' });
      res.json({ ok: true, autonomy });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/controls', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const b = (req.body || {}).controls || {};
      const before = a.controls || {};
      // updateAgent re-sanitises the whole record, so merge onto the current controls.
      await updateAgent(a.id, { controls: { ...before, ...b } });
      const after = await getAgent(a.id, { fresh: true });
      await audit(a.id, { action: 'controls_change', summary: 'Office controls updated', reason: JSON.stringify(Object.keys(b)).slice(0, 200) });
      res.json({ ok: true, controls: after.controls });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/team', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const b = req.body || {};
      const patch = {
        coverBy: sstr(b.coverBy, 80),
        supervisorId: sstr(b.supervisorId, 80),
        consultWith: Array.isArray(b.consultWith) ? b.consultWith.slice(0, 12) : (a.consultWith || [])
      };
      if (patch.coverBy === a.id) return bad(res, 'A staff member cannot cover for themselves.');
      await updateAgent(a.id, patch);
      await audit(a.id, { action: 'team_change', summary: 'Team links updated (cover: ' + (patch.coverBy || 'none') + ')', reason: 'boss' });
      res.json({ ok: true, ...patch });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/tools', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const b = req.body || {};
      const catalog = listTools().map(t => t.id);
      const tools = Array.isArray(b.tools) ? b.tools.filter(t => catalog.includes(t)) : (a.allowedTools || []);
      const level4OptIn = b.level4OptIn !== undefined ? !!b.level4OptIn : !!a.level4OptIn;
      if (level4OptIn && tools.some(t => toolLevel(t) >= 4) && b.confirmLevel4 !== true) {
        return bad(res, 'Level 4 tools are irreversible. Send confirmLevel4: true to enable them.');
      }
      await updateAgent(a.id, { allowedTools: tools, level4OptIn });
      await audit(a.id, { action: 'tools_change', summary: 'Tools: ' + tools.join(', ') + (level4OptIn ? ' (+Level 4)' : ''), reason: 'boss', riskLevel: level4OptIn ? 4 : 2 });
      res.json({ ok: true, allowedTools: tools, level4OptIn });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---------------------------------------------------------------- clients / desk
  app.get(api + '/:id/clients', async (req, res) => {
    try { res.json({ ok: true, clients: await listClients(req.params.id) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/clients/rebuild', async (req, res) => {
    try { res.json({ ok: true, clients: await rebuildClients(req.params.id) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/clients/:jid/note', async (req, res) => {
    try {
      const note = sstr((req.body || {}).note, 1000);
      const c = await patchClient(req.params.id, req.params.jid, { note });
      res.json({ ok: true, client: c });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Handover briefing: an LLM summary of what the NEXT staff member must know.
  app.post(api + '/:id/clients/:jid/briefing', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const jid = req.params.jid;
      const client = await getClient(a.id, jid);
      let brain = null;
      try { brain = await getBrain(jid, { fresh: true }); } catch (e) { brain = null; }
      const facts = [
        'Chat: ' + (client && client.name || jid) + ' (' + (client && client.type || 'person') + ')',
        'Handled by: ' + a.name + ' — ' + (a.role || 'staff'),
        brain ? ('Brain notes: ' + JSON.stringify({
          relationship: brain.relationship, tone: brain.tone, language: brain.language,
          tags: brain.tags, notes: brain.notes, persona: brain.personaProfile && brain.personaProfile.label
        }).slice(0, 1500)) : 'No brain card yet.'
      ].join('\n');
      const r = await runAgent(a, [
        { role: 'system', content: 'You write short internal handover briefings for a WhatsApp support team. Use only the facts given. Never invent prices, promises or personal data. Never include secrets or full phone numbers.' },
        { role: 'user', content: facts + '\n\nWrite a handover briefing with: WHO THEY ARE, WHAT THEY WANT, PROMISES ALREADY MADE, WATCH OUT FOR, NEXT BEST ACTION. Max 180 words.' }
      ], { purpose: 'handover briefing' });
      const briefing = { text: sstr(r.text, 2000), at: Date.now(), by: a.id, model: r.model };
      await patchClient(a.id, jid, { briefing });
      await audit(a.id, { action: 'handover_briefing', summary: 'Briefing generated for ' + (client && client.name || 'chat'), chat: jid, model: r.model });
      res.json({ ok: true, briefing });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Reassign a chat to another staff member (writes the brain card + event).
  app.post(api + '/:id/clients/:jid/handover', async (req, res) => {
    try {
      const from = await getAgent(req.params.id, { fresh: true });
      if (!from) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const toId = sstr((req.body || {}).toStaffId, 80);
      const to = await getAgent(toId, { fresh: true });
      if (!to) return bad(res, 'Target staff member not found.');
      if (to.status === 'archived') return bad(res, 'That staff member is archived.');
      const jid = req.params.jid;
      const brain = await getBrain(jid, { fresh: true });
      if (!brain) return bad(res, 'This chat has no brain card yet.');
      await saveBrain(jid, { ...brain, handledBy: to.id, agentId: to.id });
      await emitAssignmentEvent({
        chatJid: jid, chatName: brain.name || jid, type: jid.endsWith('@g.us') ? 'group' : 'person',
        staffId: to.id, previousStaffId: from.id, role: 'primary', assignedBy: 'boss', note: 'Handover'
      });
      await audit(from.id, { action: 'handover_out', summary: 'Chat handed to ' + to.name, chat: jid });
      await audit(to.id, { action: 'handover_in', summary: 'Chat received from ' + from.name, chat: jid });
      res.json({ ok: true, handledBy: to.id });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get(api + '/:id/desk', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const [clients, toolLogs, audits, lessons] = await Promise.all([
        listClients(a.id).catch(() => []),
        listToolLogs(a.id).catch(() => []),
        listAudit(a.id, { max: 60 }).catch(() => []),
        listAgentSub(a.id, 'lessons', 20).catch(() => [])
      ]);
      const tasks = [];
      for (const c of clients.slice(0, 12)) {
        if (c.note) tasks.push({ kind: 'client_note', title: c.name + ': ' + sstr(c.note, 120), at: c.updatedAt || c.assignedAt || 0, jid: c.jid });
        if (c.briefing && c.briefing.text) tasks.push({ kind: 'briefing', title: 'Handover briefing ready for ' + c.name, at: c.briefing.at || 0, jid: c.jid });
      }
      for (const l of toolLogs.filter(t => t.status === 'pending_approval').slice(0, 10)) {
        tasks.push({ kind: 'approval', title: l.tool + ' waiting for approval', at: l.createdAt || 0 });
      }
      for (const au of audits.filter(x => ['emergency_stop', 'tripwire', 'fallback', 'controls_change'].includes(x.action)).slice(0, 8)) {
        tasks.push({ kind: 'alert', title: au.summary || au.action, at: au.createdAt || 0 });
      }
      tasks.sort((x, y) => (y.at || 0) - (x.at || 0));
      res.json({
        ok: true,
        desk: {
          agent: { id: a.id, name: a.name, role: a.role, emoji: a.emoji, autonomy: a.autonomy, emergencyStop: a.emergencyStop },
          stats: { clients: clients.length, groups: clients.filter(c => c.type === 'group').length, approvals: toolLogs.filter(t => t.status === 'pending_approval').length, lessons: lessons.length },
          tasks: tasks.slice(0, 30),
          shifts: { workingHours: (a.controls || {}).workingHours || '', quietHours: (a.controls || {}).quietHours || '' }
        }
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---------------------------------------------------------------- logs / performance
  app.get(api + '/:id/logs', async (req, res) => {
    try {
      const q = sstr(req.query.q, 100);
      const rows = await listAudit(req.params.id, { q, max: 100 });
      res.json({ ok: true, logs: rows });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get(api + '/:id/performance', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const [runs, clients, complaints, fallbacks, audits, events] = await Promise.all([
        listTestRuns(a.id).catch(() => []),
        listClients(a.id).catch(() => []),
        listAgentSub(a.id, 'complaints', 50).catch(() => []),
        listFallbacks(300).catch(() => []),
        listAudit(a.id, { max: 200 }).catch(() => []),
        listEvents({ max: 60 }).catch(() => [])
      ]);
      const myFb = fallbacks.filter(f => (f.assigned || '') === a.id);
      const passRate = runs.length ? runs[0].passRate : null;
      res.json({
        ok: true,
        performance: {
          progress: computeProgress(a), confidence: computeConfidence(a),
          passRate, guardrailRate: (runs.find(r => r.kind === 'guardrail') || {}).passRate ?? null,
          runs: runs.slice(0, 10),
          clients: clients.length, groups: clients.filter(c => c.type === 'group').length,
          activeClients: clients.filter(c => (Date.now() - (c.lastActivity || 0)) < 7 * 86400000).length,
          fallbacks: myFb.length, fallbacks24h: myFb.filter(f => (Date.now() - (f.at || 0)) < 86400000).length,
          complaints: complaints.length, openComplaints: complaints.filter(c => c.status !== 'resolved').length,
          usage: a.usageDaily || { messages: 0, tokens: 0, costUsd: 0 },
          handovers: events.filter(e => e.staffId === a.id || e.previousStaffId === a.id).slice(0, 10).length,
          recentAlerts: audits.filter(x => x.status !== 'ok' || /tripwire|stop/.test(x.action)).slice(0, 10)
        }
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get(api + '/:id/complaints', async (req, res) => {
    try { res.json({ ok: true, complaints: await listAgentSub(req.params.id, 'complaints', 60) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/complaints', async (req, res) => {
    try {
      const b = req.body || {};
      const text = sstr(b.text, 800).trim();
      if (!text) return bad(res, 'Describe the complaint.');
      const saved = await addAgentSub(req.params.id, 'complaints', {
        text, chat: sstr(b.chat, 100), severity: ['low', 'medium', 'high'].includes(b.severity) ? b.severity : 'medium',
        status: 'open', by: 'boss'
      });
      await audit(req.params.id, { action: 'complaint_logged', summary: text, status: 'attention' });
      res.json({ ok: true, complaint: saved });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/complaints/:cid/resolve', async (req, res) => {
    try {
      await updateDoc(doc(db, 'agents', req.params.id, 'complaints', req.params.cid), { status: 'resolved', resolvedAt: Date.now() });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Self-review: suggestions only, never applied automatically.
  app.post(api + '/:id/review', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const runs = await listTestRuns(a.id).catch(() => []);
      const complaints = await listAgentSub(a.id, 'complaints', 20).catch(() => []);
      const facts = JSON.stringify({
        name: a.name, role: a.role, progress: computeProgress(a), confidence: computeConfidence(a),
        lastRuns: runs.slice(0, 3).map(r => ({ kind: r.kind, passRate: r.passRate })),
        complaints: complaints.slice(0, 5).map(c => ({ text: c.text, status: c.status })),
        knowledgeCount: (a.counts || {}).knowledge || 0, lessons: (a.counts || {}).lessons || 0,
        autonomy: a.autonomy, model: a.model
      });
      const r = await runAgent(a, [
        { role: 'system', content: 'You are doing an honest self-review of your own performance for your manager. Be specific and humble. Never invent metrics that are not given.' },
        { role: 'user', content: 'My metrics: ' + facts + '\n\nGive: WHAT I DO WELL (2 bullets), WHERE I AM WEAK (2 bullets), 3 CONCRETE IMPROVEMENTS (with the tab in my office where I should do them). Max 200 words.' }
      ], { purpose: 'self review' });
      return res.json({ ok: true, review: sstr(r.text, 3000), at: Date.now() });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // Zaheer as the boss's advisor: suggests, never acts.
  app.post(api + '/:id/advisor', async (req, res) => {
    try {
      const advisor = await getAgent('zaheer', { fresh: true });
      const subject = await getAgent(req.params.id, { fresh: true });
      if (!advisor || !subject) return res.status(404).json({ ok: false, error: 'Staff record not found' });
      const question = sstr((req.body || {}).question, 800).trim();
      if (!question) return bad(res, 'Ask a question.');
      const clients = await listClients(subject.id).catch(() => []);
      const facts = JSON.stringify({
        staff: { name: subject.name, role: subject.role, status: subject.status, autonomy: subject.autonomy, progress: computeProgress(subject), confidence: computeConfidence(subject) },
        clients: clients.slice(0, 10).map(c => ({ name: c.name, type: c.type, note: c.note || '' })),
        stop: !!subject.emergencyStop
      });
      const r = await runAgent(advisor, [
        { role: 'system', content: 'You are Mr. Zaheer Ahmed, the boss\'s assistant. You advise the boss on how to run the AI staff. You suggest only — you never perform actions. Be concise, practical and honest. Never invent business facts. Never include secrets, passcodes or phone numbers.' },
        { role: 'user', content: 'Staff facts: ' + facts + '\n\nBoss asks: ' + question }
      ], { purpose: 'advisor' });
      res.json({ ok: true, answer: sstr(r.text, 3000), model: r.model });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ---------------------------------------------------------------- model switcher
  app.get(api + '/:id/model', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      res.json({ ok: true, model: a.model || '', models: MODEL_OPTIONS, history: await listModelHistory(a.id), safetySensitive: isSafetySensitive(a) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/model/preview', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const out = await previewModelChange(a, sstr((req.body || {}).model, 60));
      res.json(out);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/model/apply', async (req, res) => {
    try {
      const b = req.body || {};
      const model = sstr(b.model, 60);
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      if (!b.force) {
        const preview = await previewModelChange(a, model);
        if (!preview.allowed) return res.status(409).json({ ok: false, error: preview.blockers.join(' '), blockers: preview.blockers, forceRequired: true });
        return res.json({ ok: true, ...(await applyModelChange(a.id, model, { by: 'boss', reason: sstr(b.reason, 200), score: preview.candidate.scorecard.passRate })), preview });
      }
      res.json({ ok: true, ...(await applyModelChange(a.id, model, { by: 'boss', reason: sstr(b.reason, 200) })), forced: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post(api + '/:id/model/rollback', async (req, res) => {
    try { res.json({ ok: true, ...(await rollbackModel(req.params.id, { by: 'boss' })) }); }
    catch (e) { bad(res, e.message); }
  });

  // ---------------------------------------------------------------- policy preview (debug)
  app.post(api + '/:id/policy-check', async (req, res) => {
    try {
      const a = await getAgent(req.params.id, { fresh: true });
      if (!a) return res.status(404).json({ ok: false, error: 'Staff member not found' });
      const b = req.body || {};
      const brain = b.jid ? await getBrain(sstr(b.jid, 100), { fresh: true }).catch(() => null) : (b.brain || null);
      res.json({ ok: true, decision: evaluateReplyPolicy({ staff: a, brain, incoming: sstr(b.incoming, 1000) }) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
