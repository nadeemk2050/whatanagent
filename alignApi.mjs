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
import { listAgents } from './agentsStore.mjs';
import {
  ALIGN_BASE, board, alignDb, alignAuth, alignAdminStatus
} from './alignAdmin.mjs';
import {
  loginStaff, verifyStaffSession, verifyTeamUnlock, verifyAnyTeamUnlock, issueStaffSession,
  upsertStaff, listStaff, getStaffByHandle, getStaffByUid, deleteStaff,
  setTeamPassword, teamHasPassword, unlockTeam, authAudit, recentAuthEvents,
  normalizeHandle, SESSION_HOURS, UNLOCK_HOURS,
  getOwnProfile, updateOwnProfile, setStaffProfileFields, adminUpdateStaff, revealStaffPassword
} from './alignAuth.mjs';
import { registerAlignWaMultiRoutes } from './alignWaMulti.mjs';
import { registerAlignVesselRoutes } from './alignVessel.mjs';

const sstr = (v, n = 2000) => String(v == null ? '' : v).slice(0, n);
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
// The shared action password lets ANY team member edit/delete ANY task (boss rule: "with
// this password we can do anything"). Case-insensitive; override with ALIGN_ACTION_PASSWORD.
const actionPassword = () => String(process.env.ALIGN_ACTION_PASSWORD || process.env.ALIGN_STAFF_EDIT_PASSWORD || 'abcd').trim().toLowerCase();
function actionPasswordOk(b) {
  const given = String((b && (b.adminPassword || b.actionPassword || b.password)) || '').trim().toLowerCase();
  return !!given && given === actionPassword();
}

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

// Management (masters / user details / team password) is allowed either from a staff
// session with owner·admin role, OR from a verified Firebase login that the board already
// marks as owner·admin — so the owner does not have to pass the team gate to manage users.
async function resolveManager(req) {
  const s = sessionOf(req);
  if (s) {
    if (s.role !== 'owner' && s.role !== 'admin') return null;
    return { kind: 'staff', uid: s.uid, handle: s.handle, name: s.name, role: s.role };
  }
  const raw = String(req.headers['x-firebase-token'] || '').trim();
  if (!raw) return null;
  let decoded;
  try { decoded = await alignAuth().verifyIdToken(raw); } catch (e) { return null; }
  const uid = decoded.uid;
  const rec = getStaffByUid(uid);
  if (rec && (rec.role === 'owner' || rec.role === 'admin')) {
    return { kind: 'firebase', uid, handle: rec.handle, name: rec.name, role: rec.role };
  }
  try {
    const snap = await alignDb().doc(`${ALIGN_BASE}/users/${uid}`).get();
    if (snap.exists) {
      const u = snap.data() || {};
      const role = String(u.role || '');
      if (role === 'owner' || role === 'admin') {
        return { kind: 'firebase', uid, handle: String(u.name || decoded.email || uid), name: String(u.name || ''), role };
      }
    }
  } catch (e) { /* storage not configured */ }
  return null;
}

function requireManager(req, res, next) {
  resolveManager(req).then(m => {
    if (!m) return res.status(401).json({ ok: false, error: 'Sign in as the owner to manage team members.' });
    req.staff = req.staff || { uid: m.uid, handle: m.handle, name: m.name, role: m.role };
    req.manager = m;
    next();
  }).catch(() => res.status(401).json({ ok: false, error: 'Sign in as the owner to manage team members.' }));
}

// Team-member management (list, add, edit details, set/reveal passwords) is open to every
// signed-in team member — not only the owner. `req.staff` comes from requireStaff, which
// runs first. One guard stays: only an owner may change/remove an owner's record, so a
// member can never lock the owner out.
function requireStaffMember(req, res, next) {
  if (!req.staff || !req.staff.handle) {
    return res.status(401).json({ ok: false, error: 'Team sign in first — then you can manage team members.' });
  }
  next();
}

function isOwnerRecord(handle, teamIds) {
  const rec = getStaffByHandle(handle, teamIds);
  return !!(rec && (rec.role === 'owner' || rec.role === 'admin'));
}

function canTouchMember(req, handle) {
  const teams = staffTeams(req);
  if (!isOwnerRecord(handle, teams.length ? teams : undefined)) return true;
  return !!(req.staff && (req.staff.role === 'owner' || req.staff.role === 'admin'));
}

const stampOf = (staff) => ({
  uid: staff.uid,
  handle: staff.handle,
  name: staff.name
});

// The signed session only carries uid/handle/name/role, so team scope is read from the
// staff record (which is also the source of truth when membership changes).
function staffTeams(req) {
  try {
    const rec = req && req.staff && req.staff.uid ? getStaffByUid(req.staff.uid) : null;
    return rec && Array.isArray(rec.teamIds) ? rec.teamIds.slice() : [];
  } catch (e) {
    return [];
  }
}

function noAdmin(res) {
  const st = alignAdminStatus();
  return res.status(503).json({
    ok: false,
    error: 'AlignTasks storage is not configured on this server.',
    detail: st.error || ''
  });
}

// The board's Firestore rules resolve a member's teams from `users/<uid>.teamIds`.
// A staff member who signs in with a name (custom token) may not have that document
// yet, so keep it in sync from the staff record — otherwise their reads are denied.
async function ensureBoardUser(rec) {
  if (!rec || !rec.uid) return;
  try {
    const ref = alignDb().collection(`${ALIGN_BASE}/users`).doc(rec.uid);
    const email = String((rec.aliases && rec.aliases[0]) || (rec.handle + '@staff.align.internal')).toLowerCase();
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() || {}) : {};

    // Team membership must never be wiped: fall back to what the board already knows,
    // then to the board staff directory (which carries the team of a newly added member).
    let teamIds = Array.isArray(rec.teamIds) && rec.teamIds.length ? rec.teamIds.slice() : [];
    if (!teamIds.length && Array.isArray(existing.teamIds) && existing.teamIds.length) {
      teamIds = existing.teamIds.slice();
    }
    if (!teamIds.length) {
      try {
        const staffCol = alignDb().collection(`${ALIGN_BASE}/staff`);
        const found = await staffCol.where('email', '==', email).get();
        let hit = found.docs.find(d => String((d.data() || {}).teamId || ''));
        if (!hit) {
          const byHandle = await staffCol.get();
          hit = byHandle.docs.find(d => {
            const v = d.data() || {};
            return String(v.handle || v.name || '').toLowerCase() === String(rec.handle || '').toLowerCase() && v.teamId;
          });
        }
        const teamId = hit ? String((hit.data() || {}).teamId || '') : '';
        if (teamId) teamIds = [teamId];
      } catch (e) { /* directory may be unavailable */ }
    }

    const data = {
      name: rec.name || rec.handle,
      email,
      // The board UI enables its management screens for role 'admin', so an AlignTasks
      // owner/admin must land there too (a member maps to 'user').
      role: (rec.role === 'owner' || rec.role === 'admin') ? 'admin' : 'user',
      teamIds,
      active: rec.active !== false
    };
    if (teamIds.length) {
      data.defaultTeamId = existing.defaultTeamId && teamIds.includes(existing.defaultTeamId) ? existing.defaultTeamId : teamIds[0];
      const roles = Object.assign({}, existing.teamRoles || {});
      teamIds.forEach(id => { if (!roles[id]) roles[id] = (rec.role === 'owner' ? 'owner' : 'member'); });
      data.teamRoles = roles;
    }
    await ref.set(snap.exists ? data : Object.assign({ createdAt: new Date() }, data), { merge: true });
  } catch (e) {
    console.warn('[ALIGN] users doc sync skipped: ' + sstr(e.message, 120));
  }
}

// ---------------------------------------------------------------- routes
export function registerAlignRoutes(app) {
  const api = '/api/align';
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'align' });
  // These responses are per-user and change constantly; a cached 200 would show stale
  // staff lists / task boards (browsers cache JSON GETs heuristically).
  app.use(api, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  console.log('[ALIGN] 🎯 AlignTasks API registered');

  // Per-account WhatsApp linking (QR scan on the customer's own number, send-only).
  try { registerAlignWaMultiRoutes(app, { api, requireStaff }); }
  catch (e) { console.warn('[ALIGN] WhatsApp multi-account routes unavailable: ' + ((e && e.message) || e)); }

  // Vessel live tracking (AIS). Shared by everyone in the same team.
  try {
    registerAlignVesselRoutes(app, { api, requireStaff, scopeOf: (req) => (staffTeams(req)[0] || String((req.staff && req.staff.uid) || '')) });
  } catch (e) { console.warn('[ALIGN] Vessel tracking routes unavailable: ' + ((e && e.message) || e)); }

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
    // Which teams does the e-mail account that is signed in belong to? Team logins are
    // scoped by team, so two different accounts may each have a member called "nadeemk".
    let myTeams = [];
    let verified = false;
    const fbRaw = String(req.headers['x-firebase-token'] || '').trim();
    if (fbRaw) {
      try {
        const decoded = await alignAuth().verifyIdToken(fbRaw);
        verified = true;
        try {
          const u = await alignDb().doc(`${ALIGN_BASE}/users/${decoded.uid}`).get();
          myTeams = u.exists ? ((u.data() || {}).teamIds || []) : [];
        } catch (e) { /* storage unavailable: fall back to an unscoped lookup */ }
      } catch (e) {
        // Unverifiable token: keep the legacy name+password behaviour.
      }
    }
    try {
      const b = req.body || {};
      const name = sstr(b.name || b.handle, 60);
      const out = loginStaff(name, sstr(b.password, 200), verified ? (myTeams.length ? myTeams : ['__no-team__']) : undefined);

      // Also mint a Firebase custom token so the browser gets a real Firebase
      // identity (needed for Firestore reads and for the WebSocket session).
      let customToken = null;
      try {
        const rec = getStaffByUid(out.staff.uid);
        if (rec && rec.uid) {
          await ensureBoardUser(rec);
          customToken = await alignAuth().createCustomToken(rec.uid);
        }
      } catch (e) {
        // Not fatal: the staff session still works for every API call.
        console.warn('[ALIGN] custom token not issued: ' + sstr(e.message, 120));
      }

      res.json({ ok: true, ...out, customToken, teams: out.staff.teamIds || [] });
    } catch (e) {
      const isAuth = /incorrect|Too many|disabled|no password/i.test(e.message);
      let scoped = null;
      try {
        const b2 = req.body || {};
        scoped = getStaffByHandle(sstr(b2.name || b2.handle, 60), verified ? myTeams : undefined);
      } catch (err) { /* ignore */ }
      res.status(isAuth ? 401 : 400).json({
        ok: false,
        error: e.message,
        code: isAuth ? (scoped ? 'bad-password' : 'no-team-login') : undefined
      });
    }
  });

  // A customer who signs up with an e-mail gets its OWN team login (name + password) here.
  // The Firebase ID token proves who is asking, and the team list is read from that account's
  // board profile — so a new customer can never be attached to somebody else's board.
  app.post(api + '/staff/signup', async (req, res) => {
    try {
      const raw = String(req.headers['x-firebase-token'] || '').trim();
      if (!raw) return bad(res, 'Sign in with your email first.', 401);
      let decoded;
      try {
        decoded = await alignAuth().verifyIdToken(raw);
      } catch (e) {
        return bad(res, 'Your sign-in expired — sign in again.', 401);
      }
      const uid = decoded.uid;
      const b = req.body || {};
      const name = sstr(b.name || String(decoded.email || '').split('@')[0], 60).trim();
      const password = sstr(b.password, 200);
      if (!name) return bad(res, 'Enter your name.');
      if (password.length < 6) return bad(res, 'Choose a password of at least 6 characters.');

      let teamIdsAll = [];
      try {
        const snap = await alignDb().doc(`${ALIGN_BASE}/users/${uid}`).get();
        const u = snap.exists ? (snap.data() || {}) : {};
        teamIdsAll = Array.isArray(u.teamIds) ? u.teamIds.slice(0, 50) : [];
      } catch (e) {
        if (e.code === 'align-no-admin') return noAdmin(res);
        console.warn('[ALIGN] signup profile read skipped: ' + sstr(e.message, 120));
      }

      // The team the caller is actually working in (validated against their own teams).
      if (!teamIdsAll.length) return bad(res, 'Your team is not ready yet — reload the page and try again.', 409);
      const wantedTeam = sstr(b.teamId, 80);
      const teamIds = (wantedTeam && teamIdsAll.includes(wantedTeam)) ? [wantedTeam] : teamIdsAll;

      // Team logins are keyed per team, so a name used by another account is not a clash:
      // this account gets its own "nadeemk" inside its own team.
      const existing = getStaffByUid(uid);
      const handle = existing ? existing.handle : name;
      const saved = upsertStaff({
        handle,
        name,
        password,
        role: existing ? existing.role : 'owner',
        teamIds: teamIds,
        uid,
        aliases: decoded.email ? [String(decoded.email).toLowerCase()] : []
      });
      if (!saved) return bad(res, 'Could not create your team login.');
      const out = loginStaff(handle, password, teamIds);

      let customToken = null;
      try {
        const rec = getStaffByUid(uid);
        if (rec && rec.uid) {
          await ensureBoardUser(rec);
          customToken = await alignAuth().createCustomToken(rec.uid);
        }
      } catch (e) {
        console.warn('[ALIGN] signup custom token skipped: ' + sstr(e.message, 120));
      }
      authAudit({ action: 'staff_self_signup', handle, note: 'teams=' + (teamIds.length ? teamIds.join(',') : 'none') });
      res.json({ ok: true, ...out, customToken, teams: (out.staff && out.staff.teamIds) || teamIds });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      bad(res, e.message);
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

  // A fresh Firebase custom token for the signed-in staff member. Used when the browser
  // has a valid staff session but no Firebase identity (new origin/tab or after a sign-out),
  // so dismissing the gate never drops the person back to the email login screen.
  app.get(api + '/staff/token', requireStaff, async (req, res) => {
    try {
      const rec = getStaffByUid(req.staff.uid);
      if (!rec || !rec.uid) return res.status(404).json({ ok: false, error: 'Staff record not found.' });
      await ensureBoardUser(rec);
      const customToken = await alignAuth().createCustomToken(rec.uid);
      res.json({ ok: true, customToken, uid: rec.uid, name: rec.name });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
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

  app.post(api + '/team/password', requireManager, (req, res) => {
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
            password: String(password).toLowerCase(),
            displayName: name,
            disabled: b.active === false
          });
          uid = created.uid;
        } else if (password) {
          await auth.updateUser(uid, { password: String(password).toLowerCase() });
        }
        if (uid && b.active !== undefined) await auth.updateUser(uid, { disabled: b.active === false });
      } catch (e) {
        console.warn('[ALIGN] Firebase user step skipped: ' + sstr(e.message, 140));
      }

      const saved = upsertStaff({
        handle, name, password, uid,
        role: b.role, teamIds: Array.isArray(b.teamIds) ? b.teamIds : undefined,
        active: b.active,
        aliases: Array.isArray(b.aliases) ? b.aliases : undefined
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

  // ---- team staff management (owner session, no dashboard token needed) ----
  // This is the panel inside AlignTasks: the owner is already signed in with a
  // staff name + password, so requiring ADMIN_TOKEN here would be a second login.
  app.get(api + '/team/staff', requireStaff, requireStaffMember, (req, res) => {
    const myTeams = staffTeams(req);
    res.json({ ok: true, staff: listStaff(myTeams.length ? myTeams : undefined) });
  });

  app.post(api + '/team/staff', requireStaff, requireStaffMember, async (req, res) => {
    try {
      const b = req.body || {};
      const handle = normalizeHandle(b.handle || b.name);
      const name = sstr(b.name, 60).trim();
      const myTeams = staffTeams(req);
      if (isOwnerRecord(handle, myTeams) && !canTouchMember(req, handle)) {
        return bad(res, 'Only an owner can change another owner’s login.', 403);
      }
      const password = sstr(b.password, 200);
      if (!handle || !name) return bad(res, 'A name is required.');
      if (handle.length < 2) return bad(res, 'Name must be at least 2 characters.');
      const existing = getStaffByHandle(handle, myTeams.length ? myTeams : undefined);
      if (!existing && !password) return bad(res, 'Set a password for the new member.');
      if (password && password.length < 6) return bad(res, 'Password must be at least 6 characters.');

      let uid = (existing || {}).uid || '';
      try {
        const auth = alignAuth();
        if (!uid) {
          const created = await auth.createUser({
            email: `${handle.replace(/\s+/g, '.')}@staff.align.internal`,
            password: String(password).toLowerCase(),
            displayName: name,
            disabled: b.active === false
          });
          uid = created.uid;
        } else if (password) {
          await auth.updateUser(uid, { password: String(password).toLowerCase() });
        }
        if (uid && b.active !== undefined) await auth.updateUser(uid, { disabled: b.active === false });
      } catch (e) {
        console.warn('[ALIGN] Firebase user step skipped: ' + sstr(e.message, 140));
      }

      // A new login must land in a team, otherwise Firestore shows them nothing.
      let teamIds = Array.isArray(b.teamIds) && b.teamIds.length ? b.teamIds : undefined;
      if (!teamIds && req.staff && req.staff.uid) {
        try {
          const myRec = getStaffByUid(req.staff.uid);
          if (myRec && Array.isArray(myRec.teamIds) && myRec.teamIds.length) {
            teamIds = myRec.teamIds.slice();
          } else {
            const u = await alignDb().doc(`${ALIGN_BASE}/users/${req.staff.uid}`).get();
            const t = u.exists ? (u.data() || {}).teamIds : null;
            if (Array.isArray(t) && t.length) teamIds = t.slice();
          }
        } catch (e) { /* ignore — stays without teams */ }
      }

      const saved = upsertStaff({
        handle, name, password, uid,
        role: b.role,
        teamIds,
        active: b.active,
        aliases: Array.isArray(b.aliases) ? b.aliases : undefined
      });
      authAudit({ action: 'staff_save', handle: saved.handle, note: 'by ' + (req.staff ? req.staff.handle : 'unknown') });
      try { await ensureBoardUser(getStaffByHandle(saved.handle, myTeams.length ? myTeams : undefined)); } catch (e) { /* non-fatal */ }
      // Mirror into the board staff directory (once per team) so the new member also shows
      // up in assignee pickers. Never creates duplicates.
      try {
        const rec = getStaffByHandle(saved.handle, myTeams.length ? myTeams : undefined) || {};
        const teams = Array.isArray(rec.teamIds) ? rec.teamIds : [];
        const email = String((rec.aliases && rec.aliases[0]) || (rec.handle + '@staff.align.internal')).toLowerCase();
        for (const teamId of teams) {
          const col = alignDb().collection(`${ALIGN_BASE}/staff`);
          const found = await col.where('teamId', '==', teamId).get();
          const hit = found.docs.find(d => {
            const v = d.data() || {};
            return String(v.email || '').toLowerCase() === email
              || String(v.handle || v.name || '').toLowerCase() === String(rec.handle || '').toLowerCase();
          });
          const data = {
            name: rec.name || saved.name,
            handle: rec.handle,
            email,
            role: rec.role || 'member',
            teamId,
            uid: rec.uid || '',
            active: rec.active !== false,
            updatedAt: new Date()
          };
          if (hit) await hit.ref.set(data, { merge: true });
          else await col.add(Object.assign({ createdAt: new Date() }, data));
        }
      } catch (e) {
        console.warn('[ALIGN] board staff mirror skipped: ' + sstr(e.message, 120));
      }
      res.json({ ok: true, staff: saved });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      bad(res, e.message);
    }
  });

  app.delete(api + '/team/staff/:handle', requireStaff, requireStaffMember, (req, res) => {
    try {
      const myTeams = staffTeams(req);
      const scope = myTeams.length ? myTeams : undefined;
      if (isOwnerRecord(req.params.handle, scope) && !canTouchMember(req, req.params.handle)) {
        return bad(res, 'Only an owner can remove another owner’s login.', 403);
      }
      deleteStaff(req.params.handle, scope);
      authAudit({ action: 'staff_delete', handle: req.params.handle, note: 'by ' + req.staff.handle });
      res.json({ ok: true });
    } catch (e) { bad(res, e.message); }
  });

  // ---- reveal a member's team-login password (forgotten-password recovery) ----
  app.post(api + '/team/staff/reveal', requireStaff, requireStaffMember, (req, res) => {
    try {
      const handle = sstr((req.body || {}).handle, 60).trim();
      if (!handle) return bad(res, 'Which member?');
      const myTeams = staffTeams(req);
      const out = revealStaffPassword(handle, myTeams.length ? myTeams : undefined);
      authAudit({ action: 'password_reveal', handle: out.handle, note: 'by ' + req.staff.handle });
      res.json({ ok: true, ...out });
    } catch (e) { bad(res, e.message); }
  });

  // ---- edit a sub user (Settings -> Team Members -> Edit, and the profile dialog) ----
  // Saves name / email / WhatsApp / address / remarks and can reset the team-login
  // password. Any signed-in team member may do this; the admin password is still accepted
  // when the deployment sets ALIGN_STAFF_EDIT_PASSWORD, but the verified team session is
  // the real credential.
  app.post(api + '/team/staff/edit', requireStaff, requireStaffMember, async (req, res) => {
    try {
      const b = req.body || {};
      const expected = process.env.ALIGN_STAFF_EDIT_PASSWORD ? String(process.env.ALIGN_STAFF_EDIT_PASSWORD) : '';
      if (expected && b.adminPassword && String(b.adminPassword) !== expected) {
        authAudit({ action: 'subuser_edit_denied', handle: sstr(b.handle, 60), note: 'wrong admin password' });
        return bad(res, 'Wrong admin password. Nothing was saved.', 403);
      }
      const handle = sstr(b.handle, 60).trim();
      const name = sstr(b.name, 60).trim();
      if (!name) return bad(res, 'A name is required.');
      if ((handle || name) && !canTouchMember(req, handle || name)) {
        return bad(res, 'Only an owner can change another owner’s details.', 403);
      }
      const email = sstr(b.email, 120).trim();
      const password = sstr(b.password, 200);
      if (password && password.length < 6) return bad(res, 'Password must be at least 6 characters.');

      let saved = null;
      const myTeams = staffTeams(req);
      const scope = myTeams.length ? myTeams : undefined;
      if (handle || email) {
        saved = adminUpdateStaff({
          handle: handle || name,
          name,
          email,
          whatsapp: b.whatsapp,
          address: b.address,
          remarks: b.remarks,
          password: password || undefined,
          teamIds: scope
        });
      }

      // Keep the Firebase identity in step when a password was given.
      if (saved && password) {
        try {
          if (saved.uid && /^[A-Za-z0-9]{20,}$/.test(saved.uid)) {
            await alignAuth().updateUser(saved.uid, { password: String(password).toLowerCase(), displayName: name, disabled: saved.active === false });
          }
        } catch (e) { console.warn('[ALIGN] Firebase password sync skipped: ' + sstr(e.message, 120)); }
        try { await ensureBoardUser(getStaffByHandle(saved.handle, scope)); } catch (e) { /* non-fatal */ }
      }

      res.json({ ok: true, staffLogin: !!saved, staff: saved });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      bad(res, e.message);
    }
  });

  app.get(api + '/auth/audit', guard, (req, res) => {
    res.json({ ok: true, events: recentAuthEvents(Number(req.query.max) || 100) });
  });

  // ============================================================ WhatsApp bridge
  // AlignTasks reminders are sent by THIS server through the WhatsApp Web session it
  // already holds (the linked company account — the same login as the dashboard), so a
  // reminder is a real WhatsApp message; no browser, phone or WhatsApp app must be open.
  // The Playwright-free plumbing lives in waWebClient.js (sendWaWebMessage / getWaWebChats).
  let waModCache = null;
  const waMod = async () => (waModCache || (waModCache = await import('./waWebClient.js')));
  const waDigits = (raw) => {
    let d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '971' + d.slice(1);   // UAE local 05x -> 9715x
    return d;
  };

  app.get(api + '/wa/status', requireStaff, async (req, res) => {
    try {
      const wa = await waMod();
      const st = wa.getWaWebStatus() || {};
      let groups = 0;
      try {
        const snap = await alignDb().doc('appData/alignWaGroupsIndex').get();
        const v = snap.exists ? (snap.data() || {}) : {};
        groups = Number(v.count) || (Array.isArray(v.groups) ? v.groups.length : 0);
      } catch (e) { /* the index is optional */ }
      res.json({
        ok: true,
        connected: st.status === 'connected',
        status: st.status || 'disconnected',
        phone: (st.user && st.user.phone) || '',
        name: (st.user && st.user.name) || '',
        groups
      });
    } catch (e) {
      res.json({ ok: true, connected: false, status: 'unavailable', phone: '', name: '', groups: 0, error: sstr(e.message, 120) });
    }
  });

  app.get(api + '/wa/groups', requireStaff, async (req, res) => {
    try {
      const wa = await waMod();
      const force = String(req.query.refresh || '') === '1';
      let list = [];
      // Live source of truth: every group the linked WhatsApp is a member of (a group that was
      // created a minute ago is included even before it has any messages).
      if (typeof wa.fetchWaGroupsLive === 'function') {
        list = await wa.fetchWaGroupsLive(force);
      }
      if (!Array.isArray(list) || !list.length) {
        list = (wa.getWaWebChats() || [])
          .filter(c => c && c.isGroup)
          .map(c => ({ jid: c.id, name: String(c.name || 'Group').trim() }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      res.json({ ok: true, total: list.length, groups: list.slice(0, 2000), at: Date.now() });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message, 160) });
    }
  });

  // Individual (non-group) chats from the linked WhatsApp, so a reminder can go to any contact.
  app.get(api + '/wa/contacts', requireStaff, async (req, res) => {
    try {
      const wa = await waMod();
      const chats = wa.getWaWebChats() || [];
      const map = new Map();
      for (const c of chats) {
        if (!c || c.isGroup) continue;
        const id = String(c.id || '');
        if (!id || /@(g\.us|broadcast|newsletter)$/i.test(id) || id === 'status@broadcast') continue;
        const phone = String(c.realPhone || c.phone || '').replace(/[^0-9]/g, '');
        const key = phone || id;
        if (map.has(key)) continue;
        const name = String(c.name || '').trim() || (phone ? '+' + phone : 'WhatsApp contact');
        map.set(key, { jid: id, name, phone });
      }
      const list = Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      res.json({ ok: true, total: list.length, contacts: list.slice(0, 3000), at: Date.now() });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message, 160) });
    }
  });

  // Send a reminder now (or a plain message) to members / groups / any phone number.
  app.post(api + '/wa/send', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const message = sstr(b.message, 900).trim();
      if (!message) return bad(res, 'Write the message first.');
      const targets = Array.isArray(b.targets) ? b.targets.slice(0, 25) : [];
      if (!targets.length) return bad(res, 'Pick at least one member, group or number.');
      const wa = await waMod();
      const st = wa.getWaWebStatus() || {};
      if (st.status !== 'connected') {
        return bad(res, 'The linked WhatsApp is not connected right now (' + (st.status || 'offline') + '). Nothing was sent.', 503);
      }
      const results = [];
      for (const t of targets) {
        const raw = String(t.id || '').trim();
        const isGroup = t.type === 'group' || /@g\.us$/i.test(raw);
        // groups and LID contacts keep their JID; a plain number becomes a phone JID
        const jid = isGroup ? raw : (waDigits(raw) ? waDigits(raw) + '@s.whatsapp.net' : (/@/.test(raw) ? raw : ''));
        const label = sstr(t.name, 80).trim() || jid;
        if (!jid) { results.push({ name: label, ok: false, error: 'no-whatsapp-number' }); continue; }
        try {
          await Promise.race([
            wa.sendWaWebMessage(jid, message),
            new Promise((_, rej) => setTimeout(() => rej(new Error('send-timeout-25s')), 25000))
          ]);
          results.push({ name: label, ok: true });
        } catch (e) {
          results.push({ name: label, ok: false, error: sstr(e.message || e, 160) });
        }
      }
      const sent = results.filter(r => r.ok).length;
      authAudit({ action: 'wa_reminder', handle: req.staff.handle, note: sent + '/' + results.length + ' sent' });
      res.json({ ok: sent > 0, sent, failed: results.length - sent, results, from: (st.user && st.user.phone) || '' });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      bad(res, sstr(e.message || e, 200));
    }
  });

  // ============================================================ 🤖 AI follow-up on a task
  // A task can carry an AI brain: a chosen agent talks to a WhatsApp person/group, chases the
  // job on a routine, confirms it (keywords / AI read / proof), then reports and stops.
  // The chasing engine is the existing conditional-task state machine, so this is only the
  // configuration + a deterministic document per task.
  app.get(api + '/ai/agents', requireStaff, async (req, res) => {
    try {
      const rows = await listAgents({ fresh: false }).catch(() => []);
      const agents = (Array.isArray(rows) ? rows : []).map(a => ({
        id: a.id,
        name: a.name || a.id,
        role: a.role || a.jobTitle || '',
        status: a.status || 'newly_hired',
        confidence: a.confidence || 0,
        ready: a.status === 'ready'
      }));
      res.json({ ok: true, agents: agents.slice(0, 80) });
    } catch (e) { res.json({ ok: true, agents: [] }); }
  });

  // Keep the chasing document in step with the task (one doc per task: task_<id>).
  async function syncTaskAiFollowUp(taskId, kind, cfg, staff) {
    try {
      if (!taskId) return;
      const docId = 'task_' + taskId;
      const cref = alignDb().collection('conditionalTasks').doc(docId);
      if (!cfg || !cfg.enabled) { await cref.delete().catch(() => {}); return; }
      const cur = await cref.get();
      const prev = cur.exists ? (cur.data() || {}) : {};
      const started = (prev.taskId === taskId && prev.status === 'active') ? prev.stage : 'pending_send';
      await cref.set({
        taskId: taskId,
        taskKind: kind === 'assigned' ? 'assigned' : 'shared',
        source: 'aligntasks',
        title: cfg.title || prev.title || '',
        target: cfg.targetName || cfg.targetJid,
        targetJid: cfg.targetJid,
        targetType: cfg.targetType,
        message: cfg.firstMessage,
        waitMinutes: cfg.waitMinutes,
        retryAfterMinutes: cfg.retryAfterMinutes,
        maxRetries: cfg.maxRetries,
        activeFrom: cfg.activeFrom,
        activeTo: cfg.activeTo,
        notifyBoss: cfg.notifyBoss,
        onReplyMode: 'ai',
        agentId: cfg.agentId || '',
        agentName: cfg.agentName || '',
        confirmMode: cfg.confirmMode,
        confirmKeywords: cfg.confirmKeywords,
        requireProof: cfg.requireProof,
        onConfirm: cfg.onConfirm,
        announceJid: cfg.announceJid || '',
        announceName: cfg.announceName || '',
        honorPromise: cfg.honorPromise,
        language: cfg.language,
        status: 'active',
        stage: started || 'pending_send',
        nextActionAt: (prev.taskId === taskId && prev.nextActionAt) ? prev.nextActionAt : Date.now() + 15000,
        attempts: prev.taskId === taskId ? (prev.attempts || 0) : 0,
        updatedAt: Date.now(),
        createdBy: (staff && staff.name) || prev.createdBy || ''
      }, { merge: true });
      authAudit({ action: 'ai_followup_saved', handle: (staff && staff.handle) || '', note: taskId + ' → ' + (cfg.targetName || cfg.targetJid) });
    } catch (e) {
      console.warn('[ALIGN] ai follow-up sync skipped: ' + sstr(e.message, 120));
    }
  }

  function sanitizeAiFollowUp(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.enabled !== true) return { enabled: false };
    const targetRaw = sstr(raw.targetJid, 220).trim();
    const isGroup = raw.targetType === 'group' || /@g\.us$/i.test(targetRaw);
    let jid = '';
    if (isGroup) jid = /@g\.us$/i.test(targetRaw) ? targetRaw : '';
    else jid = waDigits(targetRaw) ? waDigits(targetRaw) + '@s.whatsapp.net' : (/@/.test(targetRaw) ? targetRaw : '');
    if (!jid) return { enabled: false, error: 'Choose the WhatsApp person or group to talk to.' };
    return {
      enabled: true,
      agentId: sstr(raw.agentId, 80).trim(),
      agentName: sstr(raw.agentName, 80).trim(),
      targetType: isGroup ? 'group' : 'contact',
      targetJid: jid,
      targetName: sstr(raw.targetName, 140).trim(),
      firstMessage: sstr(raw.firstMessage, 900).trim(),
      waitMinutes: Math.min(Math.max(Number(raw.waitMinutes) || 120, 5), 1440),
      retryAfterMinutes: Math.min(Math.max(Number(raw.retryAfterMinutes) || 240, 10), 2880),
      maxRetries: Math.min(Math.max(Number(raw.maxRetries) || 3, 1), 10),
      activeFrom: Math.min(Math.max(Number(raw.activeFrom == null ? 8 : raw.activeFrom), 0), 23),
      activeTo: Math.min(Math.max(Number(raw.activeTo == null ? 21 : raw.activeTo), 1), 24),
      confirmMode: ['keywords', 'ai', 'proof'].includes(raw.confirmMode) ? raw.confirmMode : 'keywords',
      confirmKeywords: sstr(raw.confirmKeywords, 300).trim() || 'done, paid, received, sent, completed, ho gaya, de diya',
      requireProof: !!raw.requireProof,
      onConfirm: ['stop', 'mark_done', 'announce'].includes(raw.onConfirm) ? raw.onConfirm : 'stop',
      announceJid: sstr(raw.announceJid, 220).trim(),
      announceName: sstr(raw.announceName, 140).trim(),
      honorPromise: raw.honorPromise !== false,
      notifyBoss: raw.notifyBoss !== false,
      language: ['auto', 'en', 'ur'].includes(raw.language) ? raw.language : 'auto'
    };
  }

  // Attach / remove the AI follow-up on an existing task. Used by the Android app, which writes
  // tasks straight to Firestore and therefore has no team id to pass.
  app.post(api + '/task/ai', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.id, 120);
      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      if (!id) return bad(res, 'A task id is required.');
      const ref = board(collectionFor(kind)).doc(id);
      const cur = await ref.get();
      if (!cur.exists) return bad(res, 'Task not found.', 404);
      const existing = cur.data() || {};
      const cfg = sanitizeAiFollowUp(b.aiFollowUp);
      if (cfg && cfg.enabled) {
        await ref.set({ aiFollowUp: cfg }, { merge: true });
        await syncTaskAiFollowUp(id, kind, Object.assign({ title: sstr(existing.description, 200) }, cfg), req.staff);
        return res.json({ ok: true, enabled: true, target: cfg.targetJid });
      }
      await ref.set({ aiFollowUp: { enabled: false } }, { merge: true });
      await syncTaskAiFollowUp(id, kind, { enabled: false }, req.staff);
      res.json({ ok: true, enabled: false });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      bad(res, sstr(e.message, 200));
    }
  });

  // ============================================================ push notifications
  // Web Push: the phone/laptop gets a real notification even when the app is closed.
  let pushModCache = null;
  const pushMod = async () => (pushModCache || (pushModCache = await import('./alignPush.mjs')));

  // Which identities does this staff member answer to? Task reminders address people by board
  // email (or handle), so a device is registered under every alias it can be reached on.
  async function pushIdentities(req) {
    const staff = (req && req.staff) || {};
    const emails = new Set();
    const add = (v) => { const e = String(v || '').trim().toLowerCase(); if (e) emails.add(e); };
    add(staff.handle);
    add(staff.handle ? staff.handle + '@staff.align.internal' : '');
    (Array.isArray(staff.aliases) ? staff.aliases : []).forEach(add);
    try {
      const snap = await board('staff').where('teamId', '==', (req.teamId || '')).limit(100).get();
      snap.forEach(d => {
        const v = d.data() || {};
        const h = String(v.handle || '').toLowerCase();
        const nm = String(v.name || '').toLowerCase();
        if (h === String(staff.handle || '').toLowerCase() || nm === String(staff.name || '').toLowerCase()) {
          add(v.email);
          add(h);
        }
      });
    } catch (e) { /* team directory is optional */ }
    if (staff.uid) {
      try {
        const u = await alignDb().doc(`${ALIGN_BASE}/users/${staff.uid}`).get();
        if (u.exists) add((u.data() || {}).email);
      } catch (e) { /* ignore */ }
    }
    return { uid: staff.uid || '', name: staff.name || staff.handle || '', emails: Array.from(emails) };
  }

  app.get(api + '/push/key', requireStaff, async (req, res) => {
    try {
      const p = await pushMod();
      res.json({ ok: true, key: p.pushPublicKey() });
    } catch (e) { bad(res, sstr(e.message, 160)); }
  });

  app.post(api + '/push/subscribe', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const p = await pushMod();
      const who = await pushIdentities(req);
      const id = await p.savePushSubscription(b.subscription || b, Object.assign({ ua: b.ua || '' }, who));
      authAudit({ action: 'push_subscribe', handle: req.staff.handle, note: who.emails.join(', ').slice(0, 120) });
      res.json({ ok: true, id, emails: who.emails });
    } catch (e) { bad(res, sstr(e.message, 160)); }
  });

  app.post(api + '/push/unsubscribe', requireStaff, async (req, res) => {
    try {
      const p = await pushMod();
      const endpoint = sstr((req.body || {}).endpoint, 500);
      if (!endpoint) return bad(res, 'Which device?');
      await p.removePushSubscription(endpoint);
      res.json({ ok: true });
    } catch (e) { bad(res, sstr(e.message, 160)); }
  });

  app.post(api + '/push/test', requireStaff, async (req, res) => {
    try {
      const p = await pushMod();
      const who = await pushIdentities(req);
      const r = await p.sendPush({
        title: '🔔 AlignTasks notifications work',
        body: 'This is a test. Task reminders will arrive here even when the app is closed.',
        url: '/aligntasks/',
        tag: 'align-test'
      }, { email: who.emails[0] });
      res.json({ ok: true, ...r, emails: who.emails });
    } catch (e) { bad(res, sstr(e.message, 160)); }
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
        notes: sstr(b.notes, 1000),
        repeat: { type: sstr(b.repeat, 20) || 'none' },
        status: 'To Do',
        isPersonal: true,
        ownerUid: req.staff.uid,
        ownerName: req.staff.name,
        createdByUid: req.staff.uid,
        createdByName: req.staff.name,
        createdAt: new Date(),
        updatedAt: new Date()
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
      const patch = { updatedAt: new Date(), updatedByUid: req.staff.uid, updatedByName: req.staff.name };
      if (b.description !== undefined) patch.description = sstr(b.description, 500);
      if (b.category !== undefined) patch.category = sstr(b.category, 60);
      if (b.priority !== undefined) patch.priority = sstr(b.priority, 20);
      if (b.dueDate !== undefined) patch.dueDate = sstr(b.dueDate, 40);
      if (b.notes !== undefined) patch.notes = sstr(b.notes, 1000);
      if (b.repeat !== undefined) patch.repeat = { type: sstr(b.repeat, 20) || 'none' };
      if (b.status !== undefined) {
        patch.status = b.status === 'Done' ? 'Done' : 'To Do';
        if (patch.status === 'Done') {
          patch.completedAt = new Date();
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
      // A task without a team id is invisible to everyone and breaks the board's
      // team-scoped read rule, so never accept one.
      if (!teamId) return bad(res, 'No team selected. Reload the page and try again.');

      const desc = sstr(b.description, 1000).trim();
      if (!desc) return bad(res, 'Describe the task.');

      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      const now = Date.now();
      const stamp = stampOf(req.staff);
      const doc = {
        description: desc,
        status: 'To Do',
        teamId,
        createdAt: new Date(),
        createdBy: req.staff.handle,
        createdByUid: stamp.uid,
        createdByName: stamp.name,
        updatedAt: new Date(),
        updatedByUid: stamp.uid,
        updatedByName: stamp.name
      };
      if (b.dueDate) doc.dueDate = sstr(b.dueDate, 40);
      if (b.priority) doc.priority = sstr(b.priority, 20);
      if (Array.isArray(b.comments)) doc.comments = b.comments.slice(0, 50);
      const repeatType = sstr(b.repeat, 20);
      if (repeatType && repeatType !== 'none') doc.repeat = { type: repeatType };

      // A general task can be given to one person (responsible) or left to anyone.
      const who = sstr(b.assigneeHandle || b.assigneeEmail, 80).trim();
      if (kind === 'assigned' && !who) return bad(res, 'Choose who this task is for.');
      if (who) {
        const target = getStaffByHandle(who);
        if (!target) return bad(res, 'No staff member named "' + who + '".');
        doc.assigneeUid = target.uid;
        doc.assigneeEmail = target.handle;
        doc.assigneeName = target.name;
        doc.assignedByUid = stamp.uid;
        doc.assignedByName = stamp.name;
        doc.assignedAt = new Date();
      } else if (kind === 'shared') {
        // Unassigned: any team member may take it.
        doc.assigneeEmail = '';
        doc.assigneeName = '';
      }

      const ref = await board(collectionFor(kind)).add(doc);
      const aiCfg = sanitizeAiFollowUp(b.aiFollowUp);
      if (aiCfg && aiCfg.enabled) {
        doc.aiFollowUp = aiCfg;
        await ref.set({ aiFollowUp: aiCfg }, { merge: true });
        await syncTaskAiFollowUp(ref.id, kind, Object.assign({ title: desc }, aiCfg), req.staff);
      } else if (aiCfg) {
        await ref.set({ aiFollowUp: { enabled: false } }, { merge: true });
      }
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

      const id = sstr(b.id, 120);
      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      if (!id) return bad(res, 'A task id is required.');

      const ref = board(collectionFor(kind)).doc(id);
      const cur = await ref.get();
      if (!cur.exists) return bad(res, 'Task not found.', 404);
      const existing = cur.data() || {};
      if (existing.teamId && existing.teamId !== teamId) return bad(res, 'That task belongs to another team.', 403);
      // Any team member may change it with the shared action password ("anything" rule).
      if (kind === 'assigned' && existing.assigneeUid && existing.assigneeUid !== req.staff.uid && req.staff.role !== 'owner' && !actionPasswordOk(b)) {
        return bad(res, 'This task belongs to someone else — enter the action password to change it.', 403);
      }

      const stamp = stampOf(req.staff);
      const patch = { updatedAt: new Date(), updatedByUid: stamp.uid, updatedByName: stamp.name };      if (!existing.teamId) patch.teamId = teamId;
      if (b.description !== undefined) patch.description = sstr(b.description, 1000);
      if (b.dueDate !== undefined) patch.dueDate = sstr(b.dueDate, 40);
      if (b.priority !== undefined) patch.priority = sstr(b.priority, 20);
      if (b.status !== undefined) {
        patch.status = sstr(b.status, 20) === 'Done' ? 'Done' : 'To Do';
        if (patch.status === 'Done') {
          patch.completedAt = new Date();
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
      // 🤖 AI follow-up config travels with the task (creating / updating / removing the chaser).
      if (b.aiFollowUp !== undefined) {
        const aiCfg = sanitizeAiFollowUp(b.aiFollowUp);
        if (aiCfg && aiCfg.enabled) {
          await ref.set({ aiFollowUp: aiCfg }, { merge: true });
          await syncTaskAiFollowUp(id, kind, Object.assign({ title: patch.description || existing.description || '' }, aiCfg), req.staff);
        } else {
          await ref.set({ aiFollowUp: { enabled: false } }, { merge: true });
          await syncTaskAiFollowUp(id, kind, { enabled: false }, req.staff);
        }
      }
      // Only a real change to the task counts as an edit — a comment must never make a task
      // look "edited". The changed fields are kept so the board can say WHAT was modified.
      const changes = [];
      if (patch.description !== undefined && String(patch.description) !== String(existing.description || '')) changes.push('text');
      if (patch.dueDate !== undefined && String(patch.dueDate || '') !== String(existing.dueDate || '')) changes.push('due date');
      if (patch.priority !== undefined && String(patch.priority || '') !== String(existing.priority || '')) changes.push('priority');
      if (patch.assigneeEmail !== undefined && String(patch.assigneeEmail || '') !== String(existing.assigneeEmail || '')) changes.push('assignee');
      if (patch.projectId !== undefined && String(patch.projectId || '') !== String(existing.projectId || '')) changes.push('project');
      if (changes.length) {
        const log = Array.isArray(existing.editLog) ? existing.editLog.slice(-19) : [];
        log.push({ by: stamp.name, at: Date.now(), fields: changes });
        await ref.set({
          editedAt: new Date(),
          editedByUid: stamp.uid,
          editedByName: stamp.name,
          editedFields: changes,
          editLog: log
        }, { merge: true });
      }
      await auditTaskEvent(id, patch.status === 'Done' ? 'completed' : 'updated', stamp, { teamId, kind });
      res.json({ ok: true, edited: changes.length > 0, fields: changes });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Add a comment. Gated + attributed by the server so the author is truthful.
  app.post(api + '/task/comment', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const teamId = sstr(b.teamId, 80);

      const id = sstr(b.id, 120);
      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      const text = sstr(b.text, 800).trim();
      if (!id) return bad(res, 'A task id is required.');
      if (!text) return bad(res, 'Write a comment first.');

      const ref = board(collectionFor(kind)).doc(id);
      const cur = await ref.get();
      if (!cur.exists) return bad(res, 'Task not found.', 404);
      const existing = cur.data() || {};
      if (existing.teamId && existing.teamId !== teamId) return bad(res, 'That task belongs to another team.', 403);
      // Any team member may change it with the shared action password ("anything" rule).
      if (kind === 'assigned' && existing.assigneeUid && existing.assigneeUid !== req.staff.uid && req.staff.role !== 'owner' && !actionPasswordOk(b)) {
        return bad(res, 'This task belongs to someone else — enter the action password to change it.', 403);
      }

      const stamp = stampOf(req.staff);
      const comments = Array.isArray(existing.comments) ? existing.comments.slice(-49) : [];
      comments.push({
        text,
        authorUid: stamp.uid,
        authorHandle: stamp.handle,
        authorName: stamp.name,
        createdAt: Date.now()
      });
      // A comment is a conversation, not a modification of the task: it must NOT touch the
      // edit stamps (that made every commented task show "Edited by …").
      await ref.set({
        comments,
        lastCommentAt: new Date(),
        lastCommentByUid: stamp.uid,
        lastCommentByName: stamp.name,
        commentCount: comments.length
      }, { merge: true });
      await auditTaskEvent(id, 'commented', stamp, { teamId, kind, description: text.slice(0, 120) });
      res.json({ ok: true, comments });
    } catch (e) {
      if (e.code === 'align-no-admin') return noAdmin(res);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post(api + '/task/delete', requireStaff, async (req, res) => {    try {
      const b = req.body || {};
      const teamId = sstr(b.teamId, 80);

      const id = sstr(b.id, 120);
      const kind = b.kind === 'assigned' ? 'assigned' : 'shared';
      if (!id) return bad(res, 'A task id is required.');

      const ref = board(collectionFor(kind)).doc(id);
      const cur = await ref.get();
      if (!cur.exists) return bad(res, 'Task not found.', 404);
      const existing = cur.data() || {};
      if (existing.teamId && existing.teamId !== teamId) return bad(res, 'That task belongs to another team.', 403);
      // Any team member may change it with the shared action password ("anything" rule).
      if (kind === 'assigned' && existing.assigneeUid && existing.assigneeUid !== req.staff.uid && req.staff.role !== 'owner' && !actionPasswordOk(b)) {
        return bad(res, 'This task belongs to someone else — enter the action password to change it.', 403);
      }

      await ref.delete();
      await alignDb().collection('conditionalTasks').doc('task_' + id).delete().catch(() => {});   // stop the AI chaser too
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
