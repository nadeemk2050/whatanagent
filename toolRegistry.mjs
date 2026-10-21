// ============================================================================
// 🎓 AI STAFF ACADEMY — Tool Registry
// ============================================================================
// A tool = { id, name, description, riskLevel, inputSchema, handler }.
//
// Rules enforced here (not in the prompt):
//   • A staff member may only call tools listed in its own `allowedTools`.
//   • READ tools execute immediately.
//   • WRITE tools NEVER execute: they create an item in the existing approval inbox
//     (contactBrain drafts) and wait for the owner.
//   • Every call is logged to the agent's toolLogs subcollection.
//
// Credentials for any future login-backed tool must come from environment variables,
// never from the agent record, the prompt, or a log line.
// ============================================================================
import axios from 'axios';
import * as cheerio from 'cheerio';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { logToolCall } from './agentsStore.mjs';
import { saveBrainDraft } from './contactBrain.mjs';

let toolDb = null;
export function attachToolDb(db) { if (db) toolDb = db; }

const MAX_TEXT = 8000;
const ALLOWED_COLLECTIONS = ['contactBrains', 'notes', 'liveMeetingRooms'];

// --- URL safety: block localhost / private ranges / non-http schemes ------------------
function assertPublicUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || '').trim()); } catch (e) { throw new Error('That is not a valid URL.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https URLs are allowed.');
  const host = u.hostname.toLowerCase();
  const blocked =
    host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^0\./.test(host);
  if (blocked) throw new Error('That URL points to a private or local address and is not allowed.');
  return u;
}

const TOOLS = {
  // ---------------------------------------------------------------- READ
  fetch_url_text: {
    id: 'fetch_url_text',
    name: 'Fetch URL text',
    description: 'Read a public web page and return its visible text (max 8000 characters). Use for research, prices, articles.',
    riskLevel: 'read',
    inputSchema: { url: 'string (required)' },
    async handler({ url }) {
      const u = assertPublicUrl(url);
      const res = await axios.get(u.toString(), {
        timeout: 15000,
        maxContentLength: 4 * 1024 * 1024,
        maxRedirects: 3,
        responseType: 'text',
        headers: { 'User-Agent': 'WhatAnAgent-Research/1.0 (+staff agent)' }
      });
      const html = String(res.data || '');
      if (/json/.test(String(res.headers['content-type'] || ''))) {
        return { url: u.toString(), text: html.slice(0, MAX_TEXT) };
      }
      const $ = cheerio.load(html);
      $('script, style, noscript, nav, footer, header, iframe').remove();
      const text = ($('body').text() || '').replace(/\s+/g, ' ').trim();
      return { url: u.toString(), text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
    }
  },

  read_firestore_collection: {
    id: 'read_firestore_collection',
    name: 'Read Firestore collection',
    description: 'Read up to 20 documents from a whitelisted collection. Allowed: ' + ALLOWED_COLLECTIONS.join(', ') + '.',
    riskLevel: 'read',
    inputSchema: { collection: 'string (required)', max: 'number (optional, max 20)' },
    async handler({ collection: colName, max }) {
      if (!toolDb) throw new Error('Database is not attached.');
      const name = String(colName || '').trim();
      if (!ALLOWED_COLLECTIONS.includes(name)) {
        throw new Error('Collection "' + name + '" is not on the read whitelist.');
      }
      const n = Math.min(20, Math.max(1, Number(max) || 10));
      const snap = await getDocs(query(collection(toolDb, name), limit(n)));
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      return { collection: name, count: rows.length, rows: JSON.parse(JSON.stringify(rows)).slice(0, n) };
    }
  },

  shopify_read_stub: {
    id: 'shopify_read_stub',
    name: 'Shopify read (stub)',
    description: 'Placeholder for a future Shopify product/order reader. Returns a stub response.',
    riskLevel: 'read',
    inputSchema: { resource: 'string (optional)' },
    async handler({ resource }) {
      return { stub: true, resource: resource || 'products', note: 'Shopify credentials are not configured. Add SHOPIFY_STORE / SHOPIFY_TOKEN to the environment to enable this tool.' };
    }
  },

  // ---------------------------------------------------------------- WRITE (draft only)
  send_whatsapp_message: {
    id: 'send_whatsapp_message',
    name: 'Send WhatsApp message',
    description: 'Draft an outbound WhatsApp message. The owner must approve it before anything is sent.',
    riskLevel: 'write',
    inputSchema: { to: 'string (phone or contact name)', message: 'string' },
    async handler({ to, message }) {
      return { draft: true, to: String(to || ''), message: String(message || '') };
    }
  },

  update_firestore_document: {
    id: 'update_firestore_document',
    name: 'Update a record',
    description: 'Propose a change to a business record. The owner must approve it.',
    riskLevel: 'write',
    inputSchema: { collection: 'string', id: 'string', changes: 'object' },
    async handler({ collection: c, id, changes }) {
      return { draft: true, collection: String(c || ''), id: String(id || ''), changes: changes || {} };
    }
  },

  // ---------------------------------------------------------------- Level 2: internal writes
  save_note: {
    id: 'save_note',
    name: 'Save internal note',
    description: 'Save an internal note to the business notes collection. No customer-facing effect.',
    riskLevel: 'write',
    inputSchema: { title: 'string', text: 'string' },
    async handler({ title, text }) {
      if (!toolDb) throw new Error('Database is not attached.');
      const ref = await addDoc(collection(toolDb, 'notes'), {
        title: String(title || '').slice(0, 120), text: String(text || '').slice(0, MAX_TEXT), source: 'staff-agent', createdAt: Date.now()
      });
      return { saved: true, id: ref.id };
    }
  },

  // ---------------------------------------------------------------- Level 4: irreversible / bulk
  bulk_send_campaign: {
    id: 'bulk_send_campaign',
    name: 'Bulk send campaign',
    description: 'Prepare a bulk WhatsApp send to many contacts. Level 4: needs explicit opt-in AND owner approval.',
    riskLevel: 'write',
    inputSchema: { audience: 'string', message: 'string', max: 'number (max 50)' },
    async handler({ audience, message, max }) {
      const n = Math.min(50, Math.max(1, Number(max) || 10));
      return { draft: true, audience: String(audience || ''), recipients: n, message: String(message || '').slice(0, 1500), irreversible: true };
    }
  }
};

// Risk levels (0 lowest → 4 highest). Legacy riskLevel ('read'|'write') is kept for old UI.
export const RISK_LEVELS = {
  0: { label: 'Observe', hint: 'Read-only, no side effects', color: '#8b949e' },
  1: { label: 'Draft', hint: 'Produces a draft, never sends', color: '#58a6ff' },
  2: { label: 'Internal write', hint: 'Changes internal records only', color: '#3fb950' },
  3: { label: 'External / money', hint: 'Customer-facing or money — needs approval', color: '#d29922' },
  4: { label: 'Irreversible', hint: 'Bulk or destructive — explicit opt-in + approval', color: '#f85149' }
};

const TOOL_META = {
  fetch_url_text: { level: 0, scope: 'web:read' },
  read_firestore_collection: { level: 0, scope: 'db:read' },
  shopify_read_stub: { level: 0, scope: 'shopify:read' },
  send_whatsapp_message: { level: 3, scope: 'wa:send' },
  update_firestore_document: { level: 3, scope: 'db:write' },
  save_note: { level: 2, scope: 'db:internal' },
  bulk_send_campaign: { level: 4, scope: 'wa:bulk' }
};

// Sensible default tool sets per staff role family (used by the hire form + Office → Tools).
export const ROLE_TOOLSETS = {
  general: ['fetch_url_text', 'read_firestore_collection', 'save_note', 'send_whatsapp_message'],
  accounts: ['fetch_url_text', 'read_firestore_collection', 'save_note', 'send_whatsapp_message', 'update_firestore_document'],
  support: ['fetch_url_text', 'read_firestore_collection', 'save_note', 'send_whatsapp_message'],
  wellness: ['read_firestore_collection', 'save_note'],
  research: ['fetch_url_text', 'read_firestore_collection', 'save_note']
};

export function toolLevel(id) {
  return TOOL_META[id] ? TOOL_META[id].level : 1;
}
export function toolScope(id) {
  return TOOL_META[id] ? TOOL_META[id].scope : 'unknown';
}

export function listTools() {
  return Object.values(TOOLS).map(t => ({
    id: t.id, name: t.name, description: t.description, riskLevel: t.riskLevel,
    level: toolLevel(t.id), scope: toolScope(t.id), inputSchema: t.inputSchema
  }));
}

export function getToolDefinition(id) { return TOOLS[id] || null; }

// ---------------------------------------------------------------------------
// Run a tool with permission + logging + approval enforcement
// ---------------------------------------------------------------------------
export async function runTool({ agent, toolId, input = {}, ownerLabel = 'owner' }) {
  if (!agent) throw new Error('Agent not found.');
  const tool = TOOLS[toolId];
  if (!tool) throw new Error('Unknown tool: ' + toolId);

  if (!(agent.allowedTools || []).includes(toolId)) {
    await logToolCall(agent.id, { tool: toolId, riskLevel: tool.riskLevel, input: JSON.stringify(input), summary: 'Blocked: not allowed on this agent', ok: false, status: 'blocked' });
    throw new Error('Tool "' + toolId + '" is not enabled for ' + agent.name + '.');
  }

  const inputSummary = JSON.stringify(input).slice(0, 500);
  const level = toolLevel(toolId);

  // Level 4 tools are off unless the owner explicitly opted this staff member in.
  if (level >= 4 && !agent.level4OptIn) {
    await logToolCall(agent.id, { tool: toolId, riskLevel: 'level4', input: inputSummary, summary: 'Blocked: Level 4 tool needs owner opt-in', ok: false, status: 'blocked' });
    throw new Error('"' + toolId + '" is a Level 4 (irreversible) tool. Enable Level 4 for ' + agent.name + ' in the Office → Tools tab first.');
  }

  // Level 3+ never executes directly — it creates an approval item.
  if (level >= 3) {
    const preview = await tool.handler(input);
    const draft = await saveBrainDraft({
      jid: 'agent:' + agent.id,
      name: agent.name,
      kind: 'agent_tool',
      incoming: inputSummary,
      draft: '[' + toolId + '] ' + JSON.stringify(preview).slice(0, 1500),
      reason: 'agent-approval'
    });
    await logToolCall(agent.id, {
      tool: toolId, riskLevel: 'level' + level, input: inputSummary,
      summary: 'Draft created for owner approval' + (draft && draft.id ? ' (' + draft.id + ')' : ''),
      ok: true, status: 'pending_approval'
    });
    return {
      pendingApproval: true,
      tool: toolId,
      draftId: draft && draft.id ? draft.id : null,
      preview,
      message: 'This action needs your approval. Open Contact Brains → Drafts to approve or reject it.'
    };
  }

  try {
    const result = await tool.handler(input);
    const summary = JSON.stringify(result).slice(0, 900);
    await logToolCall(agent.id, { tool: toolId, riskLevel: 'level' + level, input: inputSummary, summary, ok: true, status: 'ok' });
    return { pendingApproval: false, tool: toolId, result };
  } catch (e) {
    await logToolCall(agent.id, { tool: toolId, riskLevel: 'level' + level, input: inputSummary, summary: e.message, ok: false, status: 'error' });
    throw e;
  }
}
