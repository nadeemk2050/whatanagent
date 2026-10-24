// ============================================================================
// 🎯 ALIGNTASKS API — name login, team unlock gate, and stamped task writes
// ============================================================================
// Registered from index.js via registerAlignRoutes(app).
//
// SECURITY MODEL (boss-approved):
//   • Staff sign in with NAME + PASSWORD (no email, no phone).
//   • A second gate — the TEAM password — is required before ANY task write,
//     including for the owner. Management actions (staff, team password) only
//     need the owner's session.
//   • Every task write goes through this server. Firestore rules make the board
//     read-only for clients, so the gate cannot be bypassed by calling Firebase
//     directly.
//   • Stamps (who/when) are written by the SERVER from the verified session, so
//     they cannot be forged by a browser.
//   • Nobody — including the owner — can read another person's private task.
// ============================================================================
import { makeAdminGuard } from './adminGuard.mjs';
import {
  ALIGN_BASE, board, alignDb, alignAuth, alignAdminStatus
} from './alignAdmin.mjs';
import {
  loginStaff, verifyStaffSession, verifyTeamUnlock, issueStaffSession,
  upsertStaff, listStaff, getStaffByHandle, getStaffByUid, deleteStaff,
  setTeamPassword, teamHasPassword, unlockTeam, authAudit, recentAuthEvents,
  normalizeHandle, SESSION_HOURS, UNLOCK_HOURS,
  getOwnProfile, updateOwnProfile, setStaffProfileFields
} from './alignAuth.mjs';

const sstr = (v, n = 2000) => String(v == null ? '' : v).slice(0, n);
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

// ---------------------------------------------------------------- helpers
function sessionOf(req) {
  const raw = req.headers['x-align-session'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifyStaffSession(String(raw || '').trim());
}

function unlockOf(req) {
  return String(req.headers['x-align-unlock'] || '').trim();
}

function requireStaff(req, res, next) {
  const s = sessionOf(req);
  if (!s) return res.status(401).json({ ok: false, error: 'Please sign in with your name and password.' });
  req.staff = s;
  next();
}

function requireOwner(req, res, next) {
  if (!req.staff || req.staff.role !== 'owner') {
    return res.status(403).json({ ok: false, error: 'Only the owner can manage staff and team passwords.' });
  }
  next();
}

// The team gate. Every task write calls this.
function requireUnlock(req, res, teamId) {
  if (!teamId) { bad(res, 'A team is required.'); return null; }
  const token = unlockOf(req);
  if (!token) {
    res.status(403).json({ ok: false, error: 'Team locked. Enter the team password to make changes.', needsUnlock: true, teamId });
    return null;
  }
  const t = verifyTeamUnlock(token, teamId);
  if (!t) {
    res.status(403).json({ ok: false, error: 'Team unlocked session expired. Please enter the team password again.', needsUnlock: true, teamId });
    return null;
  }
  if (t.uid !== req.staff.uid) {
    res.status(403).json({ ok: false, error: 'This unlock belongs to a different person. Unlock the team again.', needsUnlock: true, teamId });
    return null;
  }
  return t;
}

const stampOf = (staff) => ({
  uid: staff.uid,
  handle: staff.handle,
  name: staff.name
});

function noAdmin(res) {
  const st = alignAdminStatus();
  return res.status(503).json({
    ok: false,
    error: 'AlignTasks storage is not configured on this server.',
    detail: st.error || ''
  });
}

// ---------------------------------------------------------------- routes
export function registerAlignRoutes(app) {
  const api = '/api/align';
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'align' });
  console.log('[ALIGN] 🎯 AlignTasks API registered');

  // ============================================================ status
  app.get(api + '/status', (req, res) => {
    const st = alignAdminStatus();
    const s = sessionOf(req);
    res.json({
      ok: true,
      storage: { ready: st.ready, error: st.error },
      session: s ? { name: s.name, handle: s.handle, role: s.role } : null,
      sessionHours: SESSION_HOURS,
      unlockHours: UNLOCK_HOURS
    });
  });

  // ============================================================ staff login
  app.post(api + '/staff/login', async (req, res) => {
    try {
      const b = req.body || {};
      const out = loginStaff(sstr(b.name || b.handle, 60), sstr(b.password, 200));

      // Also mint a Firebase custom token so the browser gets a real Firebase
      // identity (needed for Firestore reads and for the WebSocket session).
      let customToken = null;
      try {
        const rec = getStaffByUid(out.staff.uid);
        if (rec && rec.uid) customToken = await alignAuth().createCustomToken(rec.uid);
      } catch (e) {
        // Not fatal: the staff session still works for every API call.
        console.warn('[ALIGN] custom token not issued: ' + sstr(e.message, 120));
      }

      res.json({ ok: true, ...out, customToken, teams: out.staff.teamIds || [] });
    } catch (e) {
      const code = /incorrect|Too many|disabled/.test(e.message) ? 401 : 400;
      res.status(code).json({ ok: false, error: e.message });
    }
  });

  app.get(api + '/staff/me', requireStaff, (req, res) => {
    const rec = getStaffByUid(req.staff.uid);
    if (!rec) return res.status(404).json({ ok: false, error: 'Your staff record no longer exists. Ask the owner.' });
    res.json({
      ok: true,
      staff: { uid: rec.uid, handle: rec.handle, name: rec.name, role: rec.role, teamIds: rec.teamIds || [], active: rec.active !== false },
      expiresIn: Math.max(0, Math.round((req.staff.exp - Date.now()) / 1000))
    });
  });

  // ============================================================ team unlock
  app.get(api + '/profile', requireStaff, (req, res) => {
    const rec = getOwnProfile(req.staff.uid);
    if (!rec) return res.status(404).json({ ok: false, error: 'Staff record not found.' });
    res.json({
      ok: true,
      profile: rec,
      editable: ['name', 'jobTitle', 'department', 'phone', 'whatsapp', 'timezone', 'avatarEmoji', 'bio', 'language'],
      locked: ['handle', 'role', 'teamIds', 'active', 'password']
    });
  });

  app.patch(api + '/profile', requireStaff, (req, res) => {
    try {
      const patch = req.body || {};
      // Never allow privilege escalation through the profile route.
      delete patch.role; delete patch.teamIds; delete patch.handle; delete patch.uid;
      delete patch.active; delete patch.password; delete patch.hash; delete patch.salt;
      const updated = updateOwnProfile(req.staff.uid, patch);
      authAudit({ action: 'profile_view_or_edit', handle: updated.handle });
      res.json({ ok: true, profile: updated });
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/team/unlock', requireStaff, (req, res) => {
    try {
      const b = req.body || {};
      const teamId = sstr(b.teamId, 80);
      if (!teamId) return bad(res, 'A team is required.');
      const rec = getStaffByUid(req.staff.uid);
      if (!rec) return bad(res, 'Your staff record no longer exists.');
      const staffForToken = { uid: rec.uid, handle: rec.handle, name: rec.name };
      const out = unlockTeam({ teamId, password: sstr(b.password, 200), staff: staffForToken });
      res.json({ ok: true, teamId, ...out });
    } catch (e) {
      res.status(401).json({ ok: false, error: e.message });
    }
  });

  app.get(api + '/team/status', requireStaff, (req, res) => {
    const teamId = sstr(req.query.teamId, 80);
    const token = unlockOf(req);
    const t = teamId ? verifyTeamUnlock(token, teamId) : null;
    res.json({
      ok: true,
      teamId,
      hasPassword: teamId ? teamHasPassword(teamId) : false,
      unlocked: !!t && t.uid === req.staff.uid,
      expiresAt: t ? t.exp : 0
    });
  });

  // ============================================================ owner: teams + staff
  app.get(api + '/teams', requireStaff, async (req, res) => {
    try {
      const snap = await board('teams').limit(100).get();
      const teams = [];
      snap.forEach(d => {
        const x = d.data() || {};
        teams.push({
          id: d.id,
          name: sstr(x.name, 80),
          ownerUid: sstr(x.ownerUid, 80),
          hasPassword: teamHasPassword(d.id)
        });
      });
      res.json({ ok: true, teams });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(api + '/team/password', requireStaff, requireOwner, (req, res) => {
    try {
      const b = req.body || {};
      const out = setTeamPassword(sstr(b.teamId, 80), sstr(b.password, 200), { name: sstr(b.name, 60) });
      res.json({ ok: true, ...out });
    } catch (e) { bad(res, e.message); }
  });

  app.get(api + '/staff', guard, (req, res) => {
    res.json({ ok: true, staff: listStaff(), sessionHours: SESSION_HOURS, unlockHours: UNLOCK_HOURS });
  });

  app.post(api + '/staff', guard, async (req, res) => {
    try {
      const b = req.body || {};
      const handle = normalizeHandle(b.handle || b.name);
      const password = sstr(b.password, 200);
      const name = sstr(b.name, 60).trim();
      if (!handle || !name) return bad(res, 'A name is required.');
      if (!password && !getStaffByHandle(handle)) return bad(res, 'A password is required for a new staff member.');

      let uid = (getStaffByHandle(handle) || {}).uid || '';

      // Give the staff member a real Firebase identity so Firestore rules and
      // team membership keep working. Synthetic email; never shown to the user.
      try {
        const auth = alignAuth();
        if (!uid) {
          const created = await auth.createUser({
            email: `${handle.replace(/\s+/g, '.')}@staff.align.internal`,
            password: password,
            displayName: name,
            disabled: b.active === false
          });
          uid = created.uid;
        } else if (password) {
          await auth.updateUser(uid, { password });
        }
        if (uid && b.active !== undefined) await auth.updateUser(uid, { disabled: b.active === false });
      } catch (e) {
        console.warn('[ALIGN] Firebase user step skipped: ' + sstr(e.message, 140));
      }

      const saved = upsertStaff({
        handle, name, password, uid,
        role: b.role, teamIds: Array.isArray(b.teamIds) ? b.teamIds : undefined,
        active: b.active
      });
      res.json({ ok: true, staff: saved });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      bad(res, e.message);
    }
  });

  app.delete(api + '/staff/:handle', guard, (req, res) => {
    try {
      deleteStaff(req.params.handle);
      res.json({ ok: true });
    } catch (e) { bad(res, e.message); }
  });

  app.get(api + '/auth/audit', guard, (req, res) => {
    res.json({ ok: true, events: recentAuthEvents(Number(req.query.max) || 100) });
  });

  // ============================================================ personal tasks
  // Private to the signed-in staff member. No team gate; never shared.
  app.get(api + '/personal', requireStaff, async (req, res) => {
    try {
      const snap = await alignDb().collection(`${ALIGN_BASE}/users/${req.staff.uid}/personal_tasks`).limit(300).get();
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      res.json({ ok: true, tasks: items });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(api + '/personal', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const desc = sstr(b.description || b.text, 500).trim();
      if (!desc) return bad(res, 'Describe the task.');
      const doc = {
        description: desc,
        category: sstr(b.category, 60) || 'General',
        priority: ['urgent', 'high', 'normal', 'low'].includes(b.priority) ? b.priority : 'normal',
        dueDate: sstr(b.dueDate, 40),
        status: 'Pending',
        createdByUid: req.staff.uid,
        createdByName: req.staff.name,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const ref = await alignDb().collection(`${ALIGN_BASE}/users/${req.staff.uid}/personal_tasks`).add(doc);
      res.json({ ok: true, task: { id: ref.id, ...doc } });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.patch(api + '/personal/:id', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const patch = { updatedAt: Date.now(), updatedByUid: req.staff.uid, updatedByName: req.staff.name };
      if (b.description !== undefined) patch.description = sstr(b.description, 500);
      if (b.category !== undefined) patch.category = sstr(b.category, 60);
      if (b.priority !== undefined) patch.priority = sstr(b.priority, 20);
      if (b.dueDate !== undefined) patch.dueDate = sstr(b.dueDate, 40);
      if (b.status !== undefined) {
        patch.status = b.status === 'Done' ? 'Done' : 'Pending';
        if (patch.status === 'Done') {
          patch.completedAt = Date.now();
          patch.completedByUid = req.staff.uid;
          patch.completedByName = req.staff.name;
        }
      }
      await alignDb().doc(`${ALIGN_BASE}/users/${req.staff.uid}/personal_tasks/${req.params.id}`).set(patch, { merge: true });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.delete(api + '/personal/:id', requireStaff, async (req, res) => {
    try {
      await alignDb().doc(`${ALIGN_BASE}/users/${req.staff.uid}/personal_tasks/${req.params.id}`).delete();
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ============================================================ team tasks (gated + stamped)
  // kind: 'shared' -> tasks_for_all, 'assigned' -> tasks
  const collectionFor = (kind) => (kind === 'shared' ? 'tasks_for_all' : 'tasks');

  app.get(api + '/tasks', requireStaff, async (req, res) => {
    try {
      const teamId = sstr(req.query.teamId, 80);
      if (!teamId) return bad(res, 'A team is required.');
      const out = { shared: [], assigned: [], mine: [] };

      const sharedSnap = await board('tasks_for_all').where('teamId', '==', teamId).limit(500).get();
      sharedSnap.forEach(d => out.shared.push({ id: d.id, kind: 'shared', ...d.data() }));

      const assignedSnap = await board('tasks').where('teamId', '==', teamId).limit(500).get();
      assignedSnap.forEach(d => {
        const t = d.data() || {};
        // 🔒 Privacy: an individual task is visible ONLY to its assignee.
        const visible = !t.assigneeUid
          ? true                                   // unassigned pool is shared work
          : (t.assigneeUid === req.staff.uid || t.assigneeEmail === req.staff.handle);
        if (visible) out.assigned.push({ id: d.id, kind: 'assigned', ...t });
      });
      out.mine = out.assigned.filter(t => t.assigneeUid === req.staff.uid);
      res.json({ ok: true, ...out });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(api + '/task/create', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const teamId = sstr(b.teamId, 80);
      const gate = requireUnlock(req, res, teamId);
      if (!gate) return;

      const desc = sstr(b.description, 1000).trim();
      if (!desc) return bad(res, 'Describe the task.');

      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      const now = Date.now();
      const stamp = stampOf(req.staff);
      const doc = {
        description: desc,
        status: 'Pending',
        teamId,
        createdAt: now,
        createdBy: req.staff.handle,
        createdByUid: stamp.uid,
        createdByName: stamp.name,
        updatedAt: now,
        updatedByUid: stamp.uid,
        updatedByName: stamp.name
      };
      if (b.dueDate) doc.dueDate = sstr(b.dueDate, 40);
      if (b.priority) doc.priority = sstr(b.priority, 20);
      if (Array.isArray(b.comments)) doc.comments = b.comments.slice(0, 50);

      if (kind === 'assigned') {
        const who = sstr(b.assigneeHandle || b.assigneeEmail, 80).trim();
        if (!who) return bad(res, 'Choose who this task is for.');
        const target = getStaffByHandle(who);
        if (!target) return bad(res, 'No staff member named "' + who + '".');
        doc.assigneeUid = target.uid;
        doc.assigneeEmail = target.handle;
        doc.assigneeName = target.name;
        doc.assignedByUid = stamp.uid;
        doc.assignedByName = stamp.name;
        doc.assignedAt = now;
      }

      const ref = await board(collectionFor(kind)).add(doc);
      await auditTaskEvent(ref.id, 'created', stamp, { teamId, kind, description: desc });
      res.json({ ok: true, task: { id: ref.id, kind, ...doc } });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(api + '/task/update', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const teamId = sstr(b.teamId, 80);
      const gate = requireUnlock(req, res, teamId);
      if (!gate) return;

      const id = sstr(b.id, 120);
      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      if (!id) return bad(res, 'A task id is required.');

      const ref = board(collectionFor(kind)).doc(id);
      const cur = await ref.get();
      if (!cur.exists) return bad(res, 'Task not found.', 404);
      const existing = cur.data() || {};
      if (existing.teamId !== teamId) return bad(res, 'That task belongs to another team.', 403);
      if (kind === 'assigned' && existing.assigneeUid && existing.assigneeUid !== req.staff.uid && req.staff.role !== 'owner') {
        return bad(res, 'This task belongs to someone else.', 403);
      }

      const stamp = stampOf(req.staff);
      const patch = { updatedAt: Date.now(), updatedByUid: stamp.uid, updatedByName: stamp.name };
      if (b.description !== undefined) patch.description = sstr(b.description, 1000);
      if (b.dueDate !== undefined) patch.dueDate = sstr(b.dueDate, 40);
      if (b.priority !== undefined) patch.priority = sstr(b.priority, 20);
      if (b.status !== undefined) {
        patch.status = sstr(b.status, 20) === 'Done' ? 'Done' : 'Pending';
        if (patch.status === 'Done') {
          patch.completedAt = Date.now();
          patch.completedByUid = stamp.uid;
          patch.completedByName = stamp.name;
        } else {
          patch.completedAt = null;
        }
      }
      if (b.assigneeHandle !== undefined) {
        const who = sstr(b.assigneeHandle, 80).trim();
        if (!who) {
          patch.assigneeUid = null; patch.assigneeEmail = null; patch.assigneeName = null;
        } else {
          const target = getStaffByHandle(who);
          if (!target) return bad(res, 'No staff member named "' + who + '".');
          patch.assigneeUid = target.uid;
          patch.assigneeEmail = target.handle;
          patch.assigneeName = target.name;
          patch.assignedByUid = stamp.uid;
          patch.assignedByName = stamp.name;
          patch.assignedAt = Date.now();
        }
      }

      await ref.set(patch, { merge: true });
      await auditTaskEvent(id, patch.status === 'Done' ? 'completed' : 'updated', stamp, { teamId, kind });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(api + '/task/delete', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const teamId = sstr(b.teamId, 80);
      const gate = requireUnlock(req, res, teamId);
      if (!gate) return;

      const id = sstr(b.id, 120);
      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      if (!id) return bad(res, 'A task id is required.');

      const ref = board(collectionFor(kind)).doc(id);
      const cur = await ref.get();
      if (!cur.exists) return bad(res, 'Task not found.', 404);
      const existing = cur.data() || {};
      if (existing.teamId !== teamId) return bad(res, 'That task belongs to another team.', 403);
      if (kind === 'assigned' && existing.assigneeUid && existing.assigneeUid !== req.staff.uid && req.staff.role !== 'owner') {
        return bad(res, 'This task belongs to someone else.', 403);
      }

      await ref.delete();
      await auditTaskEvent(id, 'deleted', stampOf(req.staff), { teamId, kind });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get(api + '/task/events', requireStaff, async (req, res) => {
    try {
      const id = sstr(req.query.taskId, 120);
      let q = board('taskEvents').orderBy('at', 'desc').limit(Number(req.query.max) || 60);
      if (id) q = board('taskEvents').where('taskId', '==', id).orderBy('at', 'desc').limit(60);
      const snap = await q.get();
      const events = [];
      snap.forEach(d => events.push({ id: d.id, ...d.data() }));
      res.json({ ok: true, events });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[ALIGN]    routes: login, team unlock, personal tasks, stamped task writes, audit');
}

// Append-only audit trail for task activity.
async function auditTaskEvent(taskId, action, stamp, meta = {}) {
  try {
    await board('taskEvents').add({
      taskId: sstr(taskId, 120),
      action: sstr(action, 30),
      byUid: stamp.uid,
      byName: stamp.name,
      byHandle: stamp.handle,
      teamId: sstr(meta.teamId, 80),
      kind: sstr(meta.kind, 20),
      description: sstr(meta.description, 200),
      at: Date.now()
    });
  } catch (e) { /* auditing must never break a write */ }
}
