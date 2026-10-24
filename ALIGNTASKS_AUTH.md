# AlignTasks — two-layer login & privacy model

Everything below is implemented and verified against production unless marked ⏳.

## 1. How people get in

| Layer | Who needs it | What it proves | Lasts |
|---|---|---|---|
| **Firebase sign-in** | Owner (email + password) | Account ownership | Firebase default |
| **Staff gate** — name + password | Every staff member | *Who* you are (no email, no phone) | **12 hours** |
| **Team gate** — team password | Everyone, **including the owner**, before any task write | You may act on this team's board | **12 hours** |

Staff are identified by a **name handle** (`ali khan`), not an email. Each staff
member still has one hidden synthetic Firebase identity
(`<handle>@staff.align.internal`) so team membership and rules keep working —
the person never sees or types it.

## 2. What the owner can do without the team password

Reading, plus management: staff records, team password, invites, settings.
Creating, editing, completing or deleting a task **always** requires the team gate.

## 3. Stamps — un-fakeable

Every write is stamped by the **server** from the verified session, never by the
browser:

```
createdByUid / createdByName / createdAt
updatedByUid / updatedByName / updatedAt
completedByUid / completedByName / completedAt
```

Plus an append-only `taskEvents` trail (`created`, `updated`, `completed`,
`deleted`) with who and when.

## 4. Privacy

| Data | Visible to |
|---|---|
| Personal tasks (`users/<uid>/personal_tasks`) | **That person only** — enforced by Firestore rules |
| Assigned team task (`tasks` with `assigneeUid`) | **That assignee only** — no owner exemption |
| Shared task (`tasks_for_all`) | The whole team |
| Unassigned pool task | The whole team (it is shared work) |

## 5. Credentials location

| Secret | Where | Never |
|---|---|---|
| Staff password hashes (scrypt) | `/opt/whatanagent/data/alignStaff.json` (chmod 600) | Firestore, git |
| Team password hashes (scrypt) | `/opt/whatanagent/data/alignTeams.json` (chmod 600) | Firestore, git |
| Session/unlock HMAC key | `/opt/whatanagent/data/secret.key` (chmod 600) | Firestore, git |
| Firebase service account | `/opt/whatanagent-data/serviceAccountKey.json` (chmod 600, outside the repo) | git |

Passwords are stored with **scrypt (N=16384) + per-user salt** and compared in
constant time. Plaintext is never stored, logged or transmitted anywhere except
the login request itself.

## 6. API surface

```
POST   /api/align/staff/login          name + password  → session (+ Firebase custom token)
GET    /api/align/staff/me             who am I
POST   /api/align/team/unlock          team password    → 12h unlock token
GET    /api/align/team/status          locked / unlocked
GET    /api/align/teams                teams + hasPassword
POST   /api/align/team/password        owner only
GET    /api/align/staff                owner only (admin token)
POST   /api/align/staff                owner only — create/update staff
DELETE /api/align/staff/:handle        owner only
GET    /api/align/personal             my private tasks
POST   /api/align/personal
PATCH  /api/align/personal/:id
DELETE /api/align/personal/:id
GET    /api/align/tasks?teamId=        board, privacy-filtered
POST   /api/align/task/create          team gate required
POST   /api/align/task/update          team gate required
POST   /api/align/task/delete          team gate required
GET    /api/align/task/events          audit trail
GET    /api/align/auth/audit           owner only
```

Headers: `x-align-session` (staff token) and `x-align-unlock` (team token).

## 7. Still to do

- ⏳ Route the remaining UI write paths through the API (single-task edit modal,
  project sub-tasks, comment modal, staff/user profile writes). Until these are
  migrated, **Firestore rules must stay permissive** — locking them now would
  break those paths.
- ⏳ After that: set `artifacts/**` task collections to client read-only
  (`allow write: if false`) so the gate is unbypassable even by a technical user.
- ⏳ Show the stamps in the task row UI (data is already recorded).
- ⏳ WhatsApp notifications for assign / complete / due / overdue (Phase 5).
- ⏳ Workload view + activity timeline (Phase 6).
