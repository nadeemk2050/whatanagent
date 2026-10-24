# AlignTasks - two-layer login & privacy model

Everything below is implemented and verified against production unless marked TODO.

## 1. How people get in

| Layer | Who needs it | What it proves | Lasts |
|---|---|---|---|
| **Firebase sign-in** | Owner (email + password) | Account ownership | Firebase default |
| **Staff gate** - name + password | Every staff member, **on every app open** | *Who* you are (no email, no phone) | 12 h token, but the page is shown each load |
| **Team gate** - team password | Everyone, **including the owner**, before any task write | You may act on this team's board | 12 h token, asked again on every app open |

Staff are identified by a **name handle** (`ali khan`), not an email. Each staff
member still has one hidden synthetic Firebase identity
(`<handle>@staff.align.internal`) so team membership and rules keep working -
the person never sees or types it.

Members migrated from the old board keep their real Firebase uid and their old
email as an **alias**, so `assigneeEmail` values written before the migration
still resolve to the right person.

### Gate behaviour on load

- Valid 12 h staff token -> "Confirm it is you - Continue as <name>" (one tap),
  plus "Not you? Sign in as someone else" to hand the device over.
- No token -> full "Sign in to AlignTasks" (name + password).
- A team member on a brand-new device reaches the same form after ~8 s even
  without a Firebase session; the login returns a custom token, so their Firebase
  identity is created on the spot (`users/<uid>` is synced by the server).
- The stored team unlock is cleared at boot, so the team password is always asked
  again on a fresh open.
- The gate can be dismissed at any point with the **✖** button (or
  "Continue as admin (read-only)"). The person then browses everything they are
  allowed to read, but every task write is still refused — create/edit needs the
  staff session and the team password — and a "Read-only" banner offers sign-in.
- The team picker is a dropdown drawn inside the card (a native `<select>` popup
  can paint behind the modal) and it loads the teams itself.

## 2. What the owner can do without the team password

Reading, plus management: staff records, team password, invites, settings.
Creating, editing, completing or deleting a task **always** requires the team gate.

The owner manages logins from the profile menu -> **Team logins**: set a
password, disable, or remove any member. That panel uses the owner's staff
session, not the dashboard admin token.

## 3. Stamps - un-fakeable

Every write is stamped by the **server** from the verified session, never by the
browser:

```
createdByUid / createdByName / createdAt
updatedByUid / updatedByName / updatedAt
completedByUid / completedByName / completedAt
```

Plus an append-only `taskEvents` trail (`created`, `updated`, `completed`,
`deleted`) with who and when. Task rows render them as
`Created by Nadeem Khan - 24 Oct 14:32`.

## 4. Privacy

| Data | Visible to |
|---|---|
| Personal tasks (`users/<uid>/personal_tasks`) | **That person only** - enforced by Firestore rules |
| Assigned team task (`tasks` with `assigneeUid`) | **That assignee only** - no owner exemption |
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
POST   /api/align/staff/login          name + password  -> session (+ Firebase custom token)
GET    /api/align/staff/me             who am I
POST   /api/align/team/unlock          team password    -> 12h unlock token
GET    /api/align/team/status          locked / unlocked
GET    /api/align/teams                teams + hasPassword
POST   /api/align/team/password        owner only
GET    /api/align/profile              my profile
PATCH  /api/align/profile              my profile (cannot touch role/teams)
GET    /api/align/team/staff           owner only - staff logins panel
POST   /api/align/team/staff           owner only - create / set password / enable
DELETE /api/align/team/staff/:handle   owner only
GET    /api/align/staff                owner only (dashboard admin token)
POST   /api/align/staff                owner only (dashboard admin token)
DELETE /api/align/staff/:handle        owner only (dashboard admin token)
GET    /api/align/personal             my private tasks
POST   /api/align/personal
PATCH  /api/align/personal/:id
DELETE /api/align/personal/:id
GET    /api/align/tasks?teamId=        board, privacy-filtered
POST   /api/align/task/create          team gate required
POST   /api/align/task/update          team gate required
POST   /api/align/task/comment         team gate required
POST   /api/align/task/delete          team gate required
GET    /api/align/task/events          audit trail
GET    /api/align/auth/audit           owner only
```

Headers: `x-align-session` (staff token) and `x-align-unlock` (team token).

## 7. Locked rules (client read-only tasks)

`tasks` and `tasks_for_all` are **read-only for every client**. All writes go
through `/api/align/task/*`, so the gate cannot be bypassed from devtools or by
calling the Firebase REST API directly. The guards live on the generic board match:

```
match /{col}/{docId} {
  allow read: if inMyTeam(appId, resource.data.get('teamId', ''));
  allow create: if col != 'tasks' && col != 'tasks_for_all' && createdInMyTeam(appId);
  allow update, delete: if col != 'tasks' && col != 'tasks_for_all' && inMyTeam(appId, resource.data.get('teamId', ''));
}
```

Everything else in the board tree (`projects`, `staff`, `teams`, `invites`,
`users`) keeps its previous client access, so team management still works.

Rollback: `git checkout <previous-sha> -- firestore.rules && firebase deploy --only firestore:rules`

## 8. Server integrations use the Admin SDK

Because clients lost write access and never had read access, the server-side
AlignTasks writers were dead (permission-denied). They now go through
`alignAdmin.mjs`:

- `waWebClient.js` - boss add / list / done, staff directory, and the board poll
  that drives due-date reminders + completion announcements (replaces the
  `onSnapshot` listeners the rules denied).
- `notebookApi.mjs` - Note Book -> task extraction.

## 9. Migrations

```
node deploy/migrate-team.mjs --dry            # import users -> staff logins (with aliases)
node deploy/migrate-team.mjs
node deploy/migrate-assignee-uid.mjs --dry    # fill assigneeUid on old tasks
node deploy/migrate-assignee-uid.mjs
```

## 10. Still to do (TODO)

- Project sub-tasks (`projects/{id}/tasks`) still write from the client.
- WhatsApp notifications for assign / complete / due / overdue (Phase 5).
- Workload view + activity timeline (Phase 6).
