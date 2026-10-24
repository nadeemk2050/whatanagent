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
