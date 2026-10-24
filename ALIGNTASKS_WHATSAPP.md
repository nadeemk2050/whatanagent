# AlignTasks ↔ WhatsApp bridge

AlignTasks (the board at `/aligntasks/`) sends its reminders through the **same WhatsApp
Web session this server already keeps alive** — the account linked once in the dashboard
(`auth_info_baileys`, e.g. +971 52 924 4592 "Nadeem Khan"). Nothing is sent from a browser,
a phone or the WhatsApp app; the server sends it, so a reminder arrives as a normal WhatsApp
message from the company number.

```
AlignTasks UI ──► POST /api/align/wa/send ──► sendWaWebMessage() ──► WhatsApp
        │                                        (waWebClient.js)
        └──► alignWaQueue / alignWaSchedules ──► 45s tick ──► sendWaWebMessage()
```

## Endpoints (need the team sign-in, `x-align-session`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/align/wa/status` | Link state: `connected`, `status`, `phone`, `name`, number of indexed groups |
| GET | `/api/align/wa/groups` | Live group list (`{jid, name}`) for the reminder picker |
| POST | `/api/align/wa/send` | `{ message, targets:[{type:'member'\|'group'\|'direct', id, name}] }` → sends now, returns per-target results |

`id` is a WhatsApp JID for groups (`…@g.us`) or any phone number for people; numbers are
normalised automatically (`00971…`, `05x…`, `+9715…` all work).

## Server-side senders already in `waWebClient.js`

- **`alignWaQueue`** — instant "💬 Remind" sends. Any doc with `status:'pending'` is sent within
  seconds (and retried by the 45s tick after a reconnect).
- **`alignWaSchedules`** — scheduled / repeating reminders written by the webapp; fired by
  `processDueSchedules()`.
- **Due-date watcher** — the board poll detects a task whose due time has arrived and messages
  the assignee (phone taken from the board `staff` directory), once per task.
- **`appData/alignWaGroupsIndex`** — group index refreshed by the node that holds the session.

## Reminder mode (Team settings)

- `server` (default) — sent automatically by the linked WhatsApp.
- `handoff` — opens WhatsApp with the message pre-filled; the person presses send.

If WhatsApp is offline at send time the webapp falls back to `alignWaQueue`, so the message
leaves the moment the session reconnects. The reminder dialog and Team settings show the live
link state, and Team settings has a "💬 Send me a test message" button to prove the link.

## 🔔 Alert ladder (gentle) — how a pending task reaches the person

1. **60 min before due** → quiet **Web Push** on their phone/laptop (no WhatsApp).
2. **At due time** → **WhatsApp** message to the assignee + a push.
3. **+30 min without acknowledgement** → **one** gentle WhatsApp nudge + push
   (max 2 nudges, 90 min apart).
4. **08:30** morning plan and **18:30** evening wrap-up → numbered list by WhatsApp + push,
   sent only inside their one-hour window so a restart never blasts the team.

Rules: nothing between **21:00 and 08:00 Dubai**, max **5 alerts per person per day**, no group
mentions and no phone calls in this mode. A task that is acknowledged, snoozed or done stops
immediately.

### Push notifications (new)

- Menu → **🔔 Push notifications** turns them on for that device (a test notification is sent).
- VAPID keys are generated once and stored in `ALIGN_DATA_DIR` (default `./.data`) as
  `align-vapid.json`; override with `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
- Devices live in `alignPushSubs` with every alias of the person (`handle`, board email,
  `@staff.align.internal`), so task reminders addressed by email reach the right phone.
- Endpoints: `GET /api/align/push/key`, `POST /api/align/push/subscribe`,
  `POST /api/align/push/unsubscribe`, `POST /api/align/push/test` (all need `x-align-session`).
- iPhone: works only after the site is added to the Home Screen (iOS 16.4+).

### Replies the member can send on WhatsApp

| Reply | Effect |
| --- | --- |
| `DONE` | marks the task done (only if they have exactly one pending) |
| `DONE 2` / `DONE 1,3` | marks items 2 (or 1 and 3) of the last list |
| `ON IT` / `OK` | acknowledged — no more nudges today |
| `SNOOZE 1h` / `SNOOZE 30m` / `SNOOZE 1d` | mutes reminders for that time |
| `PENDING` / `STATUS` | sends their numbered pending list again |

Numbered lists are cached per person per day in `alignDigestDaily`, so the numbers always match
the last message the person received. These replies are answered before the AI auto-reply runs,
so a staff reply is never mixed into customer conversations.

