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
  }
};

export function listTools() {
  return Object.values(TOOLS).map(t => ({
    id: t.id, name: t.name, description: t.description, riskLevel: t.riskLevel, inputSchema: t.inputSchema
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

  // WRITE tools never execute — they create an approval item.
  if (tool.riskLevel === 'write') {
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
      tool: toolId, riskLevel: 'write', input: inputSummary,
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
    await logToolCall(agent.id, { tool: toolId, riskLevel: 'read', input: inputSummary, summary, ok: true, status: 'ok' });
    return { pendingApproval: false, tool: toolId, result };
  } catch (e) {
    await logToolCall(agent.id, { tool: toolId, riskLevel: 'read', input: inputSummary, summary: e.message, ok: false, status: 'error' });
    throw e;
  }
}
