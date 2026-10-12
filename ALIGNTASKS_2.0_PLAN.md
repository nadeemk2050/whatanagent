# AlignTasks 2.0 — Full Implementation Plan

**Goal (one line):** turn AlignTasks from a single shared board bolted onto WhatAnAgent into a standalone,
multi-team work platform with its own login, teams and invites — usable with **zero dependency on the
WhatAnAgent admin dashboard or the boss AI** — while freely reusing the shared infrastructure
(Firebase project, hosting, existing server modules) where it helps.

Status: **P0–P4 IMPLEMENTED LOCALLY — NOT DEPLOYED.** Plan produced 2026-10-12; implementation done 2026-10-12 (local dev + data migration only).

---

## STATUS — what is built right now

**Decisions locked by the boss**
- Team is called a **"Team"** (user-facing).
- Existing board data became **Team #1**, owned by `nadeemalsaham@gmail.com`.
- **Open signup** for everyone; invited people join an existing team.
- One person **can belong to many teams** (like WhatsApp groups) — team switcher included.
- **Server reminder option kept** as an opt-in per team (hand-off is the default).
- Notifications: in-app + WhatsApp hand-off only (no Web Push / email for now).

**Implemented (local only — awaiting the boss's go-ahead to deploy)**
| Area | What was done | Where |
|---|---|---|
| Identity | Auto-admin hole removed; open signup; profile roles `owner`/`member`; disabled accounts blocked; friendlier signup confirm; sign-out clears all team state | `public/aligntasks/index.html` |
| Tenancy | `teams/{teamId}` created on signup; `teamId` stamped on tasks / tasks_for_all / projects / staff; **all board listeners team-scoped** (equality-only → no composite index needed); team switcher; Team Settings (name + reminder mode); Leave Team | `index.html` |
| Invites | `invites/{code}` + link `?invite=CODE`; create / copy / revoke UI with role + expiry; accept flow (expired / revoked / used-up handled); auto-join during signup | `index.html` |
| Comms | Device-side WhatsApp hand-off: **📲 Quick send** on every task row, hand-off branch inside the reminder modal, copy-message, "pick a chat" chooser; reminder mode switch (hand-off default, server queue opt-in) | `index.html` |
| Data migration | `scripts/migrate-align-teams.mjs` (`--dry` / `--apply` / `--revert`). **Applied:** Team #1 = `6QMsxNIyZLopmOd04W26` "nadeemalsaham's Team"; 100 board docs stamped; 10 user profiles mapped (1 owner, 9 members). Legacy `role` values intentionally untouched until 2.0 is live. | `scripts/` |
| Server bridge | Boss WhatsApp orders and Note Book extraction now stamp `teamId` (otherwise their tasks would be invisible on the scoped board); Note Book staff lookup filtered per team | `waWebClient.js`, `notebookApi.mjs` |
| Security rules | Team-scoped, deny-by-default rules **written but NOT deployed** (production keeps the permissive rules until 2.0 ships) | `firestore.rules.aligntasks-2.0` |

**Verified in local dev (`npm run dev`, port 3210)**
- Open signup → account + own team created; owner badge + owner controls shown.
- Second account signing up through an invite link → joined as **member** of that team, no owner controls, invite banner cleared, invite `uses` incremented.
- **Isolation proven:** a brand-new team sees **0** of Team #1's 87 general tasks, 1 individual task, projects and staff.
- Team switcher, Team Settings and Invites render and persist; sign-out leaves no stale team UI (race bug found and fixed).
- Board data restored to its original state after testing: 1 team, 10 users, 0 invites, 10 staff, 1 task, 87 general tasks.

**Still to do before/after deploy**
1. **P5** — search / filter / sort, saved views (My Day, Overdue), bulk actions.
2. **P6** — Android parity (team filters + hand-off send).
   ⚠️ **Sequencing rule:** the tightened rules must NOT be deployed before P6 is done. The Android
   client queries tasks/staff *without* a teamId filter, so deny-by-default rules would block its
   queries, and until it filters by team it can also see other teams' rows. Order: ship 2.0 web
   (permissive rules still) → Android parity → then move `firestore.rules.aligntasks-2.0` into place.
3. **P7** — deploy the staged rules (after emulator tests), then normalise legacy `role: 'admin'` → owner/member.
4. Deploy: `npm run build` → git push → Render → `firebase deploy --only hosting`.

---

# ✅ P5–P7 COMPLETED (2026-10-12) — DEPLOYED

### P5 — power & usability (web) — SHIPPED
- Filter bar on the Tasks page: **search** (text or member), **assignee filter**, and saved views
  **All · 📅 My Day · ⏰ Overdue · 👤 Unassigned · ✅ Done** (view persists in localStorage).
- **Bulk actions on the shown list**: complete all, WhatsApp-hand-off all, delete all (with confirm).
- Firestore **offline persistence** enabled (`synchronizeTabs`) → instant reopen + fewer reads.
- Multi-line assignment for client-side filtering (`applyTaskFilters`), so every list re-renders from
  the active filter instead of the raw snapshot.

### P6 — Android parity — SHIPPED (source; APK must be rebuilt & reinstalled)
- `TaskViewModel`: active-team state from the user profile, **`teamId` filter on every board query**
  (tasks, tasks_for_all, staff, projects, project tasks), `teamId` stamped on every create
  (tasks via `buildTaskData`, projects, staff, sub-users), active team persisted to SharedPreferences.
- `AppWidgets`: home-screen widgets now query the same active team (they would otherwise be blocked).
- `MainActivity`: new **device-side WhatsApp hand-off** button on each task row (`wa.me` deep link,
  WhatsApp package fallback + share sheet) — no server session involved.
- `gradlew compileDebugKotlin` → **BUILD SUCCESSFUL**.

### P7 — hardening — SHIPPED
- **Rules live**: only `/artifacts/<appId>/public/data/**` is restricted (per-team via
  `users/<uid>.teamIds`); every other collection keeps its previous permissive rule
  (`col != 'artifacts'`), so the dashboard, SEO agent, trade, gold, notes, alignWa* and the
  boss/Notebook server paths (Admin SDK bypasses rules) are untouched.
  Verified: board reads denied unauthenticated, invites readable pre-sign-in, cross-team writes denied,
  appData/contactBook still readable.
- **Composite indexes deployed** (`firestore.indexes.json`): tasks / tasks_for_all / staff / projects on
  `(teamId, …)`.
- Legacy `role` is **not** rewritten in the database (the old Android APK and the boss helper still read
  it). Instead the web app maps team role → `admin`/`user` in memory (`applyTeam`), so both generations
  of UI agree. A DB normalisation can follow once every APK is updated.
- Team Settings also gains **Export team (JSON)**; member list gains **Edit** (name + WhatsApp) and
  **Remove from team** (keeps the person's own account / other teams).

### Still open (deliberately deferred)
- Android: in-app **team switcher** and **invite-accept** UI (app uses the profile's default team).
- Per-team **audit log** and **team emoji/colour** in the switcher.
- **Weekly in-app digest** (no server needed, but not built yet).
- Rebuild + reinstall the **Android APK** so installed devices use the team-scoped queries (required
  for the live rules).
- Optional: unify `role` (admin/user → owner/member) once all APKs are updated, and drop the
  compatibility shim.
- 🔙 Rollback for the rules if ever needed: `git checkout HEAD~1 -- firestore.rules && firebase deploy --only firestore:rules`
  (or restore the previous permissive `allow read, write: if true` ruleset).

---


## 0. Scope guard (what this plan will NOT do)

- ❌ No per-user WhatsApp sessions on Render (decided: device-side hand-off only).
- ❌ No new server endpoints for login/teams/invites (all client-side Firebase).
- ❌ No rewrite of the existing board UX — upgrades are additive.
- ❌ No AI inside AlignTasks in this plan (optional, later, opt-in per team).
- ❌ No breaking of the current live usage (the boss/admin flows keep working during migration).

---

## 1. Baseline (verified today)

**Clients**

| Client | Location | Data access |
|---|---|---|
| Web PWA (v1.5) | `public/aligntasks/index.html` (~218 KB) | Firebase Auth + Firestore SDK, client-side |
| Android app | `android-kotlin/` | Firestore SDK, client-side (+ reminder-call system) |
| Admin dashboard | `public/admin.html` | links to `/aligntasks/`; boss orders via server |
| Server modules | `waWebClient.js`, `notebookApi.mjs`, `index.js` | Admin SDK reads/writes board collections |

**Data (Firestore, project `whatanagent-a1e59`)** — under `artifacts/<appId>/public/data/`:
`tasks`, `tasks_for_all`, `projects`, `projects/{id}/tasks`, `users/{uid}`,
`users/{uid}/personal_tasks`, `users/{uid}/notifications`, `staff`.
Root collections shared with WhatAnAgent: `alignWaSchedules`, `alignWaQueue`,
`alignWaGroupFavorites`, `contactBook`, `appData/alignAnnounceConfig`, `appData/alignWaGroupsIndex`,
plus `conditionalTasks` (server).

**Task fields today:** `description, assigneeEmail, dueDate, status('To Do'|'Done'), comments[],
createdAt, createdBy, ownerAdminUid, ownerAdminEmail, setAlarm, alarmSound, repeat{type,remaining}`.
**Projects:** `name, members[], createdAt, createdBy, ownerAdminUid, ownerAdminEmail`.
**Staff:** `name, email, uid, whatsappNumber`. **Users:** `name, email, role('admin'|'user'), active,
ownerAdminUid, ownerAdminEmail, createdBy, createdAt`.

**Current gaps (why 2.0 is needed)**
1. No teams — **every admin sees all tasks**; isolation is only for non-admins (by `assigneeEmail`).
2. No invites — admins create accounts manually; self sign-up closes after the first admin.
3. **Auto-admin**: any authenticated user without a `users/{uid}` doc is silently made `admin`.
4. `firestore.rules` is `allow read, write: if true` — isolation is cosmetic today.
5. Reminders/announcements depend on the server's single WhatsApp session (WhatAnAgent boss number).
6. No team-scoped notifications, digests, or search/filter power features.

---

## 2. Independence boundary

| Capability | After 2.0 | Depends on WhatAnAgent admin/boss? |
|---|---|---|
| Sign up / sign in / password reset | Firebase Auth (client) | ❌ No |
| Teams, members, invites | Firestore (client) | ❌ No |
| Tasks / projects / comments / personal tasks | Firestore (client) | ❌ No |
| In-app notifications | Firestore + client | ❌ No |
| WhatsApp sending | Device hand-off (`wa.me` / Android intent) | ❌ No |
| App hosting | Firebase Hosting (recommended) | ❌ No |
| Optional: boss AI orders, Note Book extraction, server reminders | Existing server modules, **opt-in per team** | ✅ Optional only |

**Kept (allowed) reuse:** the Firebase project, Auth, Firestore, Hosting, and optionally the
existing server for teams that explicitly opt in.

---

## 3. Target architecture

### 3.1 Expansion pattern (layers, bottom-up)

```
L0  Foundation      Backup/export, index budget, rules staging, plan doc
L1  Identity        Own auth, provisioning, roles (owner/member), profile, disable/enable
L2  Tenancy         teams/{id}, teamId on every doc, scoped queries/listeners, team switcher
L3  Access          Invites (codes/links), membership, revocation, deny-by-default rules
L4  Work            Tasks/projects/personal, due/priority/repeat, bulk ops, saved views, search
L5  Comms           Device-side WhatsApp hand-off, in-app notifications, Android parity
L6  Operations      Audit log, export/restore, quotas/read budget, parity tests (rules tests)
L7  Optional        Guest integrations (boss AI, Note Book), AI per team, Web Push/email
```

Each layer is a **vertical slice**: it ships value on its own and never requires the layer above.

### 3.2 Data model v2

```
teams/{teamId}
  { name, ownerUid, ownerEmail, createdAt, settings:{ allowMemberInvites, reminderMode } }

teams/{teamId}          ← single source of truth for membership
  members: not embedded — instead:
users/{uid}
  { name, email, role:'owner'|'member', active, teamIds:[...], defaultTeamId,
    phoneE164, createdAt, createdBy, disabledAt? }

invites/{code}
  { teamId, role, email?, createdBy, createdAt, expiresAt, maxUses, uses, status }

teams/{teamId}/audit                        (append-only: who did what, when)

Board data — flat collections + teamId (see 3.5):
  tasks           { teamId, description, assigneeEmail, dueDate, status, priority?,
                    comments[], repeat{}, setAlarm, alarmSound, createdBy, createdAt }
  tasks_for_all   { teamId, description, status, comments[], createdBy, createdAt }
  projects        { teamId, name, members[], createdBy, createdAt }
  projects/{pid}/tasks { teamId, ...same as tasks }
  staff           { teamId, name, email, uid, whatsappNumber, active }
  users/{uid}/personal_tasks   (private by design — never team-visible)
  users/{uid}/notifications
```

**Rules:** `ownerAdminUid/ownerAdminEmail` (today's de-facto tenant key) becomes **`teamId`** —
same idea, explicit name, stamped everywhere. Both are written during migration for one release
so old readers keep working.

### 3.3 Access model

- **Roles:** `owner` (all team admin powers) and `member` (own + team board). Optional `manager` later.
- **Rules (target):** deny-by-default; a user may read/write docs of teams in their `teamIds`
  (membership verified via `exists()` on `users/{uid}`); personal tasks readable only by owner;
  team settings/audit writable by owner only. Server (Admin SDK) bypasses rules by design.
- **Remove auto-admin:** no profile ⇒ **no access** (show "ask your admin for an invite").
- **First-run bootstrap:** the very first account created in a fresh deployment becomes `owner`
  (documented, one-time, guarded so it can't be claimed twice).

### 3.4 Comms model (no server WhatsApp)

- **Hand-off, not hosting:** every message is composed in-app and handed to the member's own WhatsApp:
  - member DM → `https://wa.me/<E164>?text=<encoded>`
  - group/announcement → `https://wa.me/?text=<encoded>` (WhatsApp chooser → pick the team group)
  - Android → `Intent.ACTION_SEND` / `whatsapp://send?text=` (opens compose; can target a group)
- **Templates:** task assigned, reminder, overdue, daily digest, announcement — with **Copy** + **Send**.
- **In-app notifications remain primary** (already built; Android has ringtone/reminder-call support).
- **Existing server queue (`alignWaSchedules`) stays as an opt-in team setting**, default OFF — so
  nothing that works today breaks, and teams that want automatic sends can enable it if the
  company number is available.

### 3.5 Path strategy (decision + rationale)

**Chosen: keep flat collections and add `teamId` filters** (not moving to `teams/{id}/...` paths).

- ✅ No path rewrite in the PWA, Android app, or server modules (they add a `where('teamId','==',…)`).
- ✅ Android and server keep working during the migration window.
- ✅ Fewer moving parts ⇒ less risk of breaking a live board.
- ⚠️ Requires composite indexes per query shape (budget below).
- 🔁 Future option: if a team ever needs hard physical separation, migrate that team's docs to
  `teams/{id}/…` paths — the `teamId` field makes that migration mechanical.

---

## 4. Phased plan

### P0 — Safety & foundations (0.5–1 day, no user-visible change)
**Objective:** make every later phase reversible.
- Full board export (existing `/api/align/backup` ZIP) + verified restore to a scratch namespace.
- Baseline metrics: current Firestore read/write/day from the console (before), board size.
- `firestore.indexes.json` + `firebase.json` checked in; rules kept in version control (staged, not yet tightened).
- Acceptance: export→restore round-trip reproduces tasks/projects/staff/users counts exactly.

### P1 — Identity & provisioning (1–2 days)
**Objective:** a real, safe account system.
- Remove auto-admin; require a `users/{uid}` profile for access.
- First-run bootstrap owner (one-time, guarded).
- Settings → **Team Members**: create member accounts (reuses the existing secondary-app creation
  flow), enable/disable, edit name/WhatsApp number.
- Profile: name, phone, password reset (Firebase email), sign out. Password change self-service.
- Acceptance: fresh signup → owner with own workspace; invited member has no admin controls;
  disabled member is blocked at the door; an unrelated Firebase account cannot enter.

### P2 — Tenancy (2–3 days) ← the core
**Objective:** teams with true isolation.
- `teams/{teamId}` created from your account (becomes **Team #1**).
- Stamp `teamId` on tasks, tasks_for_all, projects, project tasks, staff, users.
- Replace global listeners with **team-scoped** ones (`where('teamId','==',teamId)` + composite indexes).
- **Migration/backfill script** (server-side, idempotent, dry-run first): existing docs → Team #1,
  writing both `teamId` and the legacy `ownerAdminUid/Email` for compatibility.
- Team switcher (only shown when a user has >1 team) + Team Settings (rename, transfer ownership, leave).
- Server modules (`waWebClient`, `notebookApi`, `index.js`) + Android: add team filters (Android may
  ship one release later, with a fallback that hides team-scoped rows it can't resolve).
- Acceptance: two test teams see **zero** cross-data (tasks, staff, projects, comments, notifications);
  read counts per board-open documented and lower than today.

### P3 — Invites (1–2 days)
**Objective:** grow a team without an admin.
- `invites/{code}` + UI: generate link `/aligntasks/?invite=CODE` (copy + QR), list, revoke.
- Accept flow: login/signup → join team → land on that team's board.
- Edge cases: expired, revoked, max uses reached, already a member, email-restricted invites.
- Optional (later): email the invite.
- Acceptance: end-to-end invite with a brand-new account; all failure cases produce clear messages
  and never create partial memberships.

### P4 — Comms without WhatAnAgent (2 days)
**Objective:** messaging that works with the server switched off.
- Hand-off buttons (per 3.4) on: task rows, assignment, reminders, announcements, staff list.
- Message templates + Copy/Send; "Remind" now defaults to hand-off.
- Keep the server queue path as an **opt-in** team setting (default off).
- Android: `ACTION_SEND`/group-capable send + a **"Send on WhatsApp"** action on reminder notifications.
- Acceptance: with Render stopped, all message types can still be sent from phone and PC.

### P5 — Power & usability (2–4 days)
- Search / filter / sort: assignee, due, status, priority, project, date range.
- Saved views: **My Day**, Overdue, Unassigned, Done this week.
- Bulk actions (multi-select: complete, reassign, delete, move to project), task templates.
- Recurring-task UX polish (complete one occurrence, skip, edit series).
- Offline persistence + optimistic UI; PWA install prompt; performance pass (paginate/window listeners).
- Acceptance: warm load < 1.5 s; reads per session measured; no listener leaks when switching sections.

### P6 — Android parity (2–3 days)
- teamId filters, team switcher, invite accept, one-tap WhatsApp send, notification actions.
- Acceptance: Android user sees only their team and can send/complete without the web app.

### P7 — Hardening & optional integrations (2–3 days + optional)
- **Rules finalized:** deny-by-default, per-team, owner-only admin ops; emulator rules tests in CI.
- Audit log (`teams/{id}/audit`) for task/team/member changes.
- Export/restore automation + retention.
- **Optional guest integrations:** boss AI orders / Note Book / conditional tasks become team-scoped
  integrations (explicit team binding), never a hard dependency.
- Acceptance: rules test suite green; board fully functional with the WhatAnAgent server offline.

---

## 5. Files & touch-points

| Area | File | Change |
|---|---|---|
| PWA | `public/aligntasks/index.html` | auth gate, teams, invites, scoped listeners, hand-off UI, views |
| PWA assets | `public/aligntasks/sw.js`, `manifest.json` | version bump, offline/persist, cache strategy |
| Rules/indexes | `firestore.rules`, `firestore.indexes.json` | team-scoped deny-by-default + composite indexes |
| Server | `waWebClient.js` | team filters for staff/task reads & boss orders; reminders opt-in |
| Server | `notebookApi.mjs` | teamId on extracted tasks |
| Server | `index.js` | team filter for conditional tasks; align_task payload carries teamId |
| Migration | new `scripts/migrate-align-teams.mjs` | idempotent backfill + dry-run report |
| Dashboard | `public/admin.html` | read teamId on AlignTasks reads; link stays as-is |
| Android | `android-kotlin/**` | team filters, invite accept, WhatsApp send, notification action |
| Docs | `ALIGNTASKS_2.0_PLAN.md` (this file) | the plan |

---

## 6. Migration & rollback

1. **Dry-run** `migrate-align-teams.mjs --dry` → report: docs to update per collection, conflicts.
2. Create **Team #1** from your account; note `teamId`.
3. Backfill: set `teamId` (+ keep `ownerAdminUid/Email`) on every doc; write `teamIds` on your user doc.
4. Deploy PWA (team-aware) → verify board for Team #1 unchanged; verify a second test team sees nothing of Team #1.
5. Tighten rules **after** 24 h of clean operation.
6. Rollback: `--revert-teamId` removes only the added fields; rules revert is a single file restore.

---

## 7. Firestore budget

- Free tier: **50 K reads / 20 K writes / 20 K deletes per day**, 1 GiB, 10 GiB/month egress.
- Expected: 5 active users × few opens/day ≈ **5–25 K reads/day** (team scoping *reduces* today's reads).
- Watch items: listener count per open board; unsubscribe on section switch; offline persistence to
  avoid re-reads; composite index count (**200 max without billing**).
- Overage pricing (Blaze) ≈ cents (≈$0.03/100 K reads) ⇒ worst case a few dollars/month, not a hosting change.

---

## 8. Cost model

| Component | Now | After 2.0 |
|---|---|---|
| Render ($7 Starter) | WhatsApp session + API + serves PWA | Unchanged; PWA recommended off Render → **no extra load** |
| Firebase Hosting | also serves PWA | Recommended primary host for the PWA (free tier 10 GB/mo) |
| Firebase Auth | free | free at this scale |
| Firestore | free tier | free tier expected; cents if it grows |
| New servers | — | **none** |

---

## 9. Test matrix (minimum)

- Auth: signup, login, reset, disabled account, no-profile denial, first-run bootstrap.
- Tenancy: 2 teams × 2 users — every screen checked for cross-leak (tasks, staff, projects, comments,
  notifications, search results).
- Invites: happy path, expired, revoked, maxed-out, wrong-email, already-member.
- Comms: each template's hand-off link correctness (E164 formatting, URL encoding), Android intent.
- Migration: dry-run report accuracy, backfill idempotency, rollback.
- Performance: reads/session, warm load time, listener leak check.
- Rules: emulator suite for deny/allow per role.

---

## 10. Open decisions (blocking P1/P2)

1. **Naming** (user-facing): "Team", "Workspace", "Company" or "Department"?
2. **Current data** → becomes **Team #1 owned by your account** — confirmed?
3. **Roles**: `owner` + `member` only, or add `manager` (can assign but not invite/delete)?
4. **Sign-up policy**: invite-only after the first owner (recommended) or allow anyone to create a team?
5. **Members**: can a person belong to multiple teams, or exactly one?
6. **Server reminders**: keep as an opt-in team setting (recommended) or remove entirely?
7. **Hosting**: move the PWA to Firebase Hosting as the primary URL (recommended)?
8. **Notifications**: is in-app + WhatsApp hand-off enough, or do you want Web Push/email (extra work)?

---

## 11. Rough effort

| Phase | Effort |
|---|---|
| P0 | 0.5–1 d |
| P1 | 1–2 d |
| P2 | 2–3 d |
| P3 | 1–2 d |
| P4 | 2 d |
| P5 | 2–4 d |
| P6 | 2–3 d |
| P7 | 2–3 d |
| **Total** | **~13–20 dev-days**, shippable in slices (P0→P4 delivers the full "own login + teams + invites + device WhatsApp" product) |
