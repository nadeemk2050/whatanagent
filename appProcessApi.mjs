// ============================================================================
// 📋 WHATANAGENT APP PROCESSES — to-do, completed, and suggestions
// ============================================================================
// One place for improving WHATANAGENT itself:
//   • To-do tasks      owner or AI, with a status (todo / doing / blocked)
//   • Completed        tasks that reached "done" (reopen or remove them)
//   • Suggestions      ideas from the owner or the AI staff. A suggestion is
//                      never deleted by being promoted: it is marked
//                      "transferred" and keeps a link to the task it became.
//
// Stored in ONE document: appData/appProcesses
//   { suggestions: [], todos: [], seedIds: {}, updatedAt }
//
// Every route sits behind the fail-closed admin guard (no ADMIN_TOKEN on the
// server -> 503, wrong token -> 401), the same contract as the Workshop.
//
// Route map
//   GET  /api/appproc/state
//   POST /api/appproc/suggestion/add | update | status | remove | transfer
//   POST /api/appproc/todo/add | update | status | remove
// ============================================================================
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { makeAdminGuard } from './adminGuard.mjs';

const APP_PROCESSES = 'appProcesses';
const TODO_STATUSES = ['todo', 'doing', 'blocked', 'done', 'cancelled'];
const SUGGESTION_STATUSES = ['new', 'transferred', 'cancelled'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const CATEGORIES = ['Security', 'Workshop', 'Data', 'AI', 'SEO', 'Docs', 'Product', 'Plan'];
const MAX_SUGGESTIONS = 500;
const MAX_TODOS = 1000;

const sstr = (v, n = 4000) => String(v == null ? '' : v).slice(0, n);
const clean = (v, n) => sstr(v, n).replace(/\s+$/g, '');
const oneOf = (v, list, fallback) => (list.indexOf(String(v)) >= 0 ? String(v) : fallback);
const newId = (prefix) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const bad = (res, msg) => res.status(400).json({ ok: false, error: msg });

// ---------------------------------------------------------------------------
// Seed suggestions — the findings from the full app review. They are added
// ONCE per id (seedIds remembers them), so removing one keeps it removed.
// ---------------------------------------------------------------------------
const SEED_AT = 1763400000000;   // fixed stamp: the review that produced these
const SEED_SUGGESTIONS = [
  // ---------------------------------------------------------------- security
  {
    id: 'sg-sec-01',
    title: 'Deny client access to Firestore appData/**',
    detail: 'firestore.rules line 121 allows read and write on every collection except artifacts. The public Firebase web config is in admin.html, so anyone can read appData/seoAgent (WordPress, hPanel and FTP passwords plus the GSC service-account key) and change workshop, contacts, prices and commission data. Replace it with allow read, write: if false for appData and the business collections; the server keeps access through the Admin SDK.',
    category: 'Security', priority: 'critical'
  },
  {
    id: 'sg-sec-02',
    title: 'Rotate the Facebook Page token committed in pricesApi.mjs',
    detail: 'FB_TOKEN is hardcoded at lines 13-14 of pricesApi.mjs in a public repository. Rotate it in Meta Business Suite now, store the new token in the hosting environment or Firestore, and remove the literal from the file.',
    category: 'Security', priority: 'critical'
  },
  {
    id: 'sg-sec-03',
    title: 'Guard the prices endpoints',
    detail: '/api/prices/fetch and /api/prices/publish have no admin guard (pricesApi.mjs lines 59 and 99). Anyone can rewrite the 12-month price history and publish to WordPress and the Facebook Page. Add makeAdminGuard to both; GET /data can stay public if you want it to be.',
    category: 'Security', priority: 'critical'
  },
  {
    id: 'sg-sec-04',
    title: 'Untrack and purge auth_info_archive',
    detail: 'The folder holds 31,239 tracked files (44 MB) of LID-to-phone mappings and pre-keys in a public repo; .git is 486 MB. Run git rm -r --cached auth_info_archive, add it to .gitignore, purge history with git filter-repo or BFG, force-push, and rotate the WhatsApp session if it was ever live.',
    category: 'Security', priority: 'critical'
  },
  {
    id: 'sg-sec-05',
    title: 'Rotate the Facebook token stored in WordPress',
    detail: 'The Scrap Market plugin keeps fb_token in the WordPress option table. After rotating the leaked token, update Settings -> Scrap Market so listing auto-posting keeps working.',
    category: 'Security', priority: 'high'
  },
  {
    id: 'sg-sec-06',
    title: 'Do not trust x-forwarded-for for the scan throttle',
    detail: 'workshopApi throttled() reads the left-most X-Forwarded-For value, which a client can spoof. Use the proxy-appended address, or req.ip with trust proxy configured for the actual reverse proxy.',
    category: 'Security', priority: 'medium'
  },
  {
    id: 'sg-sec-07',
    title: 'Pin the scanned IP (DNS rebinding)',
    detail: 'assertPublicUrl resolves the host, then axios resolves it again, so a rebinding DNS answer can reach a private address. Resolve once and connect to that IP with the Host header, or re-check the socket address before reading the body.',
    category: 'Security', priority: 'medium'
  },

  // ---------------------------------------------------------------- workshop
  {
    id: 'sg-ws-01',
    title: 'Persist workspace approvals when a site is added',
    detail: 'syncNeeds() in admin.html ticks the DOM checkboxes but never writes WS.checks, and addSite() sends approvals: WS.checks, so the Workspace tab shows every supplied approval as missing. Write the computed approvals into WS.checks before sending.',
    category: 'Workshop', priority: 'high'
  },
  {
    id: 'sg-ws-02',
    title: 'Add an edit-site flow',
    detail: 'A site can be created but never corrected: name, platform, admin URL, username, password, sitemap, approvedBy and notes are fixed after the first save. Add an Edit action that reuses POST /api/workshop/site, with a replace-only password field so the stored secret is never echoed back.',
    category: 'Workshop', priority: 'high'
  },
  {
    id: 'sg-ws-03',
    title: 'Make "Add to register" a real on-ramp',
    detail: 'process/promote writes only { url }, so a promoted site has no credentials, no platform and no notes, and the register offers no editor. Open the add/edit form prefilled from the process seed instead of creating a bare record.',
    category: 'Workshop', priority: 'high'
  },
  {
    id: 'sg-ws-04',
    title: 'Crawl every sitemap URL',
    detail: 'crawlSite caps at MAXP = 25 pages while alqaryangroup.com has 47 pages plus 3 posts. Raise the cap (60 with concurrency 6) and show real coverage: pages scanned out of URLs found.',
    category: 'Workshop', priority: 'high'
  },
  {
    id: 'sg-ws-05',
    title: 'Fix the live audit claims',
    detail: 'auditSiteLive marks canonicals and schema done from the homepage only, checks www -> apex in one direction only, and reports skipped as PROCESS_STEPS.length - findings.length. Crawl a sample of pages for canonicals and schema, check both redirect directions, and report untouched steps honestly.',
    category: 'Workshop', priority: 'high'
  },
  {
    id: 'sg-ws-06',
    title: 'Throttle and cache crawl, index and health',
    detail: 'Only /scan is throttled. /google/crawl, /google/index and /health can be called in a loop; health runs up to 20 sites sequentially at 10 s each. Add the same per-IP throttle and a short server-side cache (60 s for crawl, 5 min for index).',
    category: 'Workshop', priority: 'medium'
  },
  {
    id: 'sg-ws-07',
    title: 'Archive a removed site instead of orphaning it',
    detail: 'site/remove deletes the SEO record, but process, todos and keywords stay behind and the site reappears as tracked-only. Move the whole record into an archived map with a Restore action, or delete all four keys together after a confirmation.',
    category: 'Workshop', priority: 'medium'
  },
  {
    id: 'sg-ws-08',
    title: 'Remove the duplicate notes field',
    detail: 'Notes are written to both seoAgent.sites[key].notes and websitesWorkshop.sites[key].notes. Keep the workshop copy only and stop sending the second one.',
    category: 'Workshop', priority: 'low'
  },
  {
    id: 'sg-ws-09',
    title: 'Make Prices Data per-site, or take it out',
    detail: 'The Prices tab is global (WS_PRICES) and pricesApi always publishes to alqaryangroup.com and its Facebook Page, even when opened from another site. Either key the data and publishing by site, or move the tab out of the per-site page.',
    category: 'Workshop', priority: 'medium'
  },
  {
    id: 'sg-ws-10',
    title: 'Stop calling fixed numbers live prices',
    detail: '/api/prices/fetch writes the same seven price ranges on every run, so the history repeats. Connect a real source, or label the data as indicative and remove the Fetch Fresh Prices Now wording.',
    category: 'Workshop', priority: 'medium'
  },
  {
    id: 'sg-ws-11',
    title: 'Open the Meeting Room',
    detail: 'The tab says COMING SOON while /api/office/meetings and /api/live-meeting already provide moderated meetings. Wire the workshop room to the office meeting engine: manager, assigned engineers, agenda, decisions and work orders per site.',
    category: 'Workshop', priority: 'high'
  },
  {
    id: 'sg-ws-12',
    title: 'Show all six views in the site menu',
    detail: 'The site menu offers Process, Workspace and Coming soon; Prices, Handbook and Google Index are only reachable from the chips. List every view in the menu.',
    category: 'Workshop', priority: 'low'
  },
  {
    id: 'sg-ws-13',
    title: 'Serve model ids from the server',
    detail: 'admin.html hardcodes the model list (MODELS) although the repo rule is to import ids from aiProviders.mjs. Return AVAILABLE_MODELS in /api/workshop/state and render the picker from that.',
    category: 'Workshop', priority: 'low'
  },
  {
    id: 'sg-ws-14',
    title: 'Give the engineers a schedule',
    detail: 'No scheduler calls health, crawl or audit; the AI staff are records that only answer when asked. Add a daily health pass and a weekly crawl/audit per site, and turn failures into to-do work orders.',
    category: 'Workshop', priority: 'high'
  },

  // ---------------------------------------------------------------- quality
  {
    id: 'sg-q-01',
    title: 'Add tests for the workshop',
    detail: 'There is no test for scorePage, mergeProcess, auditSiteLive or the route guards. Add a small node:test suite with fixture HTML: the 100-point maths, duplicate titles, noindex, and the merge of seed overrides.',
    category: 'Workshop', priority: 'medium'
  },
  {
    id: 'sg-q-02',
    title: 'Sync PROCESS_SEED with the live 31/36',
    detail: 'The repo seed only records 16 done steps; the dashboard shows 31 of 36. Move the 15 newer performance, content, trust and conversion steps and the current notes into the seed so the repository matches the dashboard.',
    category: 'Workshop', priority: 'medium'
  },
  {
    id: 'sg-q-03',
    title: 'Update the alqaryangroup.com handbook',
    detail: 'The handbook says 45 pages; the live page sitemap has 47 (including /news/ and /machinery-inventions/) plus 3 posts. Update the page inventory, the plugin version (0.3.7) and the sitemap section.',
    category: 'Docs', priority: 'medium'
  },
  {
    id: 'sg-q-04',
    title: 'Fix the repo llms.txt',
    detail: 'The repository copy links /sitemap_index.xml, which now returns 404, and lists only the company pages. The live llms.txt is Hostinger-generated. Point the repo file at /wp-sitemap.xml and refresh the list, or delete it and document that the live one is generated.',
    category: 'SEO', priority: 'medium'
  },
  {
    id: 'sg-q-05',
    title: 'Unify the legal name on every listing',
    detail: 'citation-pack.md and the site say Al Qaryan Industries LLC, but linkedin-directories-reviews-kit.md says Al Qaryan Industries (Pvt) Ltd and omits postcode 75700. NAP must be character-identical everywhere; fix the kit before any directory application.',
    category: 'SEO', priority: 'high'
  },
  {
    id: 'sg-q-06',
    title: 'Add site chrome to the 404 page',
    detail: 'The custom CSS hides Astra header and footer, but the 404 template does not render the q-site-head block. A dead link leaves the visitor with no navigation. Add the chrome to the 404 template, or scope the CSS so error pages keep the theme header.',
    category: 'SEO', priority: 'medium'
  },
  {
    id: 'sg-q-07',
    title: 'Refresh the Search Console sitemap count',
    detail: 'The workshop note says 37 URLs, but the core sitemap now lists 47 pages and 3 posts. Resubmit /wp-sitemap.xml, remove the dead /sitemap_index.xml entry, and update the note with the new count.',
    category: 'SEO', priority: 'high'
  },
  {
    id: 'sg-q-08',
    title: 'Fix the prices post slug',
    detail: 'The auto-published report always uses the slug pakistan-plastic-scrap-price-trends-nov-2026, so every later report lives at a URL that says November. Use a stable evergreen slug without a month, or create one post per period.',
    category: 'SEO', priority: 'medium'
  },
  {
    id: 'sg-q-09',
    title: 'Add a case-study template',
    detail: 'The case-studies step is blocked on owner facts. Add a one-page template (client, material, volume, problem, result) so the owner can fill it and the workshop can publish without inventing anything.',
    category: 'Docs', priority: 'low'
  },
  {
    id: 'sg-q-10',
    title: 'Document only credential keys that exist',
    detail: 'The handbook lists cmsLoginUser, cmsLoginPassword, hostPanelUser and hostPanelPassword, but no module reads or writes them. Either implement those flows or remove them from the handbook so the next engineer is not misled.',
    category: 'Docs', priority: 'low'
  },

  // ------------------------------------------------------------------- plan
  {
    id: 'sg-plan-01',
    title: 'Phase 0 - safety first',
    detail: 'Rotate the Facebook token, guard /api/prices/*, replace firestore.rules with client-deny on appData/**, untrack auth_info_archive, and migrate the two CLI scripts from the client SDK to an admin endpoint. Small diffs, do it first.',
    category: 'Plan', priority: 'critical'
  },
  {
    id: 'sg-plan-02',
    title: 'Phase 1 - trustworthy workshop',
    detail: 'Edit-site drawer, persisted approvals, archive instead of delete, full crawl, throttles, corrected audit claims, doc drift fixed, plus node --check and a score/merge test.',
    category: 'Plan', priority: 'high'
  },
  {
    id: 'sg-plan-03',
    title: 'Phase 2 - a real workshop',
    detail: 'Scheduled health and weekly crawl/audit per site, failures as work orders, a per-site activity timeline, the Meeting Room on the existing office meeting engine, publish actions with dry-run and audit log, per-site prices and Facebook page.',
    category: 'Plan', priority: 'high'
  },
  {
    id: 'sg-plan-04',
    title: 'Phase 3 - AI engineers that execute',
    detail: 'Let the assigned AI engineer run approved work orders through agentRunner and toolRegistry, with an owner approval gate and an auditLog entry for every change.',
    category: 'Plan', priority: 'medium'
  }
];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const metaRef = (db) => doc(db, 'appData', APP_PROCESSES);

async function readState(db) {
  const snap = await getDoc(metaRef(db));
  const d = snap.exists() ? (snap.data() || {}) : {};
  return {
    suggestions: Array.isArray(d.suggestions) ? d.suggestions.slice() : [],
    todos: Array.isArray(d.todos) ? d.todos.slice() : [],
    seedIds: (d.seedIds && typeof d.seedIds === 'object') ? { ...d.seedIds } : {},
    updatedAt: Number(d.updatedAt) || 0
  };
}

async function writeState(db, patch) {
  await setDoc(metaRef(db), { ...patch, updatedAt: Date.now() }, { merge: true });
}

// Add every seed that has never been applied. seedIds is the record, so a
// suggestion the owner removed does not come back on the next page load.
async function applySeeds(db, state) {
  const seedIds = { ...state.seedIds };
  const fresh = [];
  for (const seed of SEED_SUGGESTIONS) {
    if (seedIds[seed.id]) continue;
    seedIds[seed.id] = 1;
    if (state.suggestions.some(s => s.id === seed.id)) continue;
    fresh.push({
      id: seed.id,
      title: seed.title,
      detail: seed.detail,
      category: seed.category,
      priority: seed.priority,
      source: 'ai',
      status: 'new',
      by: 'app-review',
      byName: 'Full app review',
      transferredTodoId: '',
      createdAt: SEED_AT,
      updatedAt: SEED_AT
    });
  }
  if (fresh.length) {
    state.suggestions = fresh.concat(state.suggestions).slice(0, MAX_SUGGESTIONS);
    await writeState(db, { suggestions: state.suggestions, seedIds });
  }
  return state;
}

function counts(state) {
  const t = state.todos || [];
  const s = state.suggestions || [];
  return {
    todo: t.filter(x => x.status === 'todo').length,
    doing: t.filter(x => x.status === 'doing').length,
    blocked: t.filter(x => x.status === 'blocked').length,
    completed: t.filter(x => x.status === 'done').length,
    cancelled: t.filter(x => x.status === 'cancelled').length,
    open: t.filter(x => x.status !== 'done' && x.status !== 'cancelled').length,
    suggestions: s.filter(x => x.status === 'new').length,
    transferred: s.filter(x => x.status === 'transferred').length,
    cancelledSuggestions: s.filter(x => x.status === 'cancelled').length,
    totalSuggestions: s.length
  };
}

function payload(state) {
  return {
    ok: true,
    suggestions: state.suggestions,
    todos: state.todos,
    updatedAt: state.updatedAt || 0,
    stats: counts(state),
    statuses: TODO_STATUSES,
    suggestionStatuses: SUGGESTION_STATUSES,
    priorities: PRIORITIES,
    categories: CATEGORIES
  };
}

export function registerAppProcessRoutes(app, db) {
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'app-processes' });
  const api = '/api/appproc';
  app.use(api, guard);

  app.get(api + '/state', async (req, res) => {
    try {
      const state = await applySeeds(db, await readState(db));
      res.json(payload(state));
    } catch (e) {
      console.error('[APPPROC] state failed:', e.message);
      res.status(500).json({ ok: false, error: 'Could not load app processes: ' + e.message });
    }
  });

  // ------------------------------------------------------------- suggestions
  app.post(api + '/suggestion/add', async (req, res) => {
    try {
      const b = req.body || {};
      const title = clean(b.title, 200).trim();
      if (!title) return bad(res, 'Give the suggestion a title first.');
      const state = await readState(db);
      const item = {
        id: newId('sg'),
        title,
        detail: clean(b.detail, 6000).trim(),
        category: oneOf(b.category, CATEGORIES, 'Product'),
        priority: oneOf(b.priority, PRIORITIES, 'medium'),
        source: b.source === 'ai' ? 'ai' : 'owner',
        status: 'new',
        by: clean(b.by, 120).trim(),
        byName: clean(b.byName, 80).trim(),
        transferredTodoId: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      state.suggestions.unshift(item);
      state.suggestions = state.suggestions.slice(0, MAX_SUGGESTIONS);
      await writeState(db, { suggestions: state.suggestions });
      res.json({ ok: true, item, suggestions: state.suggestions, stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/suggestion/update', async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.id, 80);
      if (!id) return bad(res, 'Which suggestion?');
      const state = await readState(db);
      const i = state.suggestions.findIndex(s => s.id === id);
      if (i < 0) return bad(res, 'That suggestion no longer exists.');
      const cur = state.suggestions[i];
      state.suggestions[i] = {
        ...cur,
        title: b.title !== undefined ? clean(b.title, 200).trim() : cur.title,
        detail: b.detail !== undefined ? clean(b.detail, 6000).trim() : cur.detail,
        category: b.category !== undefined ? oneOf(b.category, CATEGORIES, cur.category) : cur.category,
        priority: b.priority !== undefined ? oneOf(b.priority, PRIORITIES, cur.priority) : cur.priority,
        updatedAt: Date.now()
      };
      await writeState(db, { suggestions: state.suggestions });
      res.json({ ok: true, item: state.suggestions[i], stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/suggestion/status', async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.id, 80);
      const status = oneOf(b.status, SUGGESTION_STATUSES, '');
      if (!id) return bad(res, 'Which suggestion?');
      if (!status) return bad(res, 'Unknown suggestion status.');
      const state = await readState(db);
      const i = state.suggestions.findIndex(s => s.id === id);
      if (i < 0) return bad(res, 'That suggestion no longer exists.');
      state.suggestions[i] = {
        ...state.suggestions[i],
        status,
        transferredTodoId: status === 'new' ? '' : (state.suggestions[i].transferredTodoId || ''),
        updatedAt: Date.now()
      };
      await writeState(db, { suggestions: state.suggestions });
      res.json({ ok: true, item: state.suggestions[i], stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/suggestion/remove', async (req, res) => {
    try {
      const id = sstr((req.body || {}).id, 80);
      if (!id) return bad(res, 'Which suggestion?');
      const state = await readState(db);
      state.suggestions = state.suggestions.filter(s => s.id !== id);
      await writeState(db, { suggestions: state.suggestions });
      res.json({ ok: true, suggestions: state.suggestions, stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  // Transfer -> a real to-do task. The suggestion is kept (marked transferred)
  // so the history shows where the task came from; it is not deleted.
  app.post(api + '/suggestion/transfer', async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.id, 80);
      if (!id) return bad(res, 'Which suggestion?');
      const state = await readState(db);
      const i = state.suggestions.findIndex(s => s.id === id);
      if (i < 0) return bad(res, 'That suggestion no longer exists.');
      const sug = state.suggestions[i];

      if (sug.status === 'transferred' && sug.transferredTodoId && state.todos.some(t => t.id === sug.transferredTodoId)) {
        return res.json({ ok: true, already: true, todos: state.todos, stats: counts(state) });
      }

      const task = {
        id: newId('td'),
        title: sug.title,
        detail: sug.detail,
        category: sug.category,
        priority: sug.priority,
        status: oneOf(b.status, ['todo', 'doing'], 'todo'),
        source: 'suggestion',
        sourceSuggestionId: sug.id,
        by: clean(b.by, 120).trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: 0,
        history: [{ at: Date.now(), status: 'todo', note: 'Created from suggestion ' + sug.id }]
      };
      state.todos.unshift(task);
      state.todos = state.todos.slice(0, MAX_TODOS);
      state.suggestions[i] = { ...sug, status: 'transferred', transferredTodoId: task.id, updatedAt: Date.now() };
      await writeState(db, { suggestions: state.suggestions, todos: state.todos });
      res.json({ ok: true, task, item: state.suggestions[i], todos: state.todos, stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  // ------------------------------------------------------------------ todos
  app.post(api + '/todo/add', async (req, res) => {
    try {
      const b = req.body || {};
      const title = clean(b.title, 200).trim();
      if (!title) return bad(res, 'Give the task a title first.');
      const status = oneOf(b.status, TODO_STATUSES, 'todo');
      const state = await readState(db);
      const now = Date.now();
      const task = {
        id: newId('td'),
        title,
        detail: clean(b.detail, 6000).trim(),
        category: oneOf(b.category, CATEGORIES, 'Product'),
        priority: oneOf(b.priority, PRIORITIES, 'medium'),
        status,
        source: 'owner',
        sourceSuggestionId: '',
        by: clean(b.by, 120).trim(),
        createdAt: now,
        updatedAt: now,
        completedAt: status === 'done' ? now : 0,
        history: [{ at: now, status, note: 'Created' }]
      };
      state.todos.unshift(task);
      state.todos = state.todos.slice(0, MAX_TODOS);
      await writeState(db, { todos: state.todos });
      res.json({ ok: true, task, todos: state.todos, stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/todo/update', async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.id, 80);
      if (!id) return bad(res, 'Which task?');
      const state = await readState(db);
      const i = state.todos.findIndex(t => t.id === id);
      if (i < 0) return bad(res, 'That task no longer exists.');
      const cur = state.todos[i];
      state.todos[i] = {
        ...cur,
        title: b.title !== undefined ? clean(b.title, 200).trim() : cur.title,
        detail: b.detail !== undefined ? clean(b.detail, 6000).trim() : cur.detail,
        category: b.category !== undefined ? oneOf(b.category, CATEGORIES, cur.category) : cur.category,
        priority: b.priority !== undefined ? oneOf(b.priority, PRIORITIES, cur.priority) : cur.priority,
        updatedAt: Date.now()
      };
      await writeState(db, { todos: state.todos });
      res.json({ ok: true, task: state.todos[i], stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  app.post(api + '/todo/status', async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.id, 80);
      const status = oneOf(b.status, TODO_STATUSES, '');
      if (!id) return bad(res, 'Which task?');
      if (!status) return bad(res, 'Unknown task status.');
      const state = await readState(db);
      const i = state.todos.findIndex(t => t.id === id);
      if (i < 0) return bad(res, 'That task no longer exists.');
      const cur = state.todos[i];
      const now = Date.now();
      const history = Array.isArray(cur.history) ? cur.history.slice(-19) : [];
      history.push({ at: now, status, note: '' });
      state.todos[i] = {
        ...cur,
        status,
        completedAt: status === 'done' ? now : 0,
        updatedAt: now,
        history
      };
      await writeState(db, { todos: state.todos });
      res.json({ ok: true, task: state.todos[i], todos: state.todos, stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  // Deleting a task created from a suggestion puts that suggestion back in the
  // list, so nothing silently disappears from both places.
  app.post(api + '/todo/remove', async (req, res) => {
    try {
      const id = sstr((req.body || {}).id, 80);
      if (!id) return bad(res, 'Which task?');
      const state = await readState(db);
      const task = state.todos.find(t => t.id === id);
      if (!task) return bad(res, 'That task no longer exists.');
      state.todos = state.todos.filter(t => t.id !== id);
      if (task.sourceSuggestionId) {
        const si = state.suggestions.findIndex(s => s.id === task.sourceSuggestionId);
        if (si >= 0 && state.suggestions[si].transferredTodoId === id) {
          state.suggestions[si] = {
            ...state.suggestions[si],
            status: 'new',
            transferredTodoId: '',
            updatedAt: Date.now()
          };
        }
      }
      await writeState(db, { todos: state.todos, suggestions: state.suggestions });
      res.json({ ok: true, todos: state.todos, suggestions: state.suggestions, stats: counts(state) });
    } catch (e) { bad(res, e.message); }
  });

  console.log('[APPPROC] 📋 WhatAnAgent App Processes API registered (fail-closed admin guard, ' + SEED_SUGGESTIONS.length + ' seeded suggestions)');
}
