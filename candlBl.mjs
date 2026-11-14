// ============================================================================
// 🚢 Bill of Lading reader — text extraction + field parsing
// ============================================================================
// Ported from the Containers & Lots backend, with two real bugs fixed:
//
//  1. The old prompt inserted the PDF text through an ESCAPED placeholder
//     (\${...} instead of ${...}), so the model received the literal string
//     "${(text || '').slice(0, 60000)}" and never saw the document. Every AI
//     call then threw and the local regex parser answered instead — which is
//     why the "AI BL reader" looked like it worked but never used AI.
//  2. The provider URL and Authorization header had the same escaping, so the
//     request could not succeed even if the text had been sent.
//
// The AI call now goes through aiProviders.resolveDeepSeek() (Alibaba key or a
// direct DeepSeek key, whichever is configured) and is recorded in the AI
// activity log as "Container BL Reader", so its cost shows on the dashboard.
// ============================================================================
import { resolveDeepSeek } from './aiProviders.mjs';
import { recordAiCall } from './aiTracker.mjs';
import { cachedTokensFrom } from './promptCache.mjs';

const AI_TIMEOUT_MS = 60000;

const blExtractPrompt = (text) => `You are a shipping document OCR expert. Extract structured data from the Bill of Lading text below.

Return ONLY a JSON object (no markdown, no commentary, no code fences) with EXACTLY these keys:
- "bl_number": string (the Bill of Lading number, e.g. "091600469446")
- "vessel_name": string (vessel / ocean vessel / carrier name, e.g. "EVER URBAN 227W")
- "shipper_name": string (complete Shipper / Exporter: full company name AND full physical address, city, country, phone, fax, email)
- "consignee_name": string (complete Consignee / Importer: full company name AND full physical address, city, NTN/tax ID, contact details)
- "seal_number": string (container seal number, often written after "/" in the container line like EMCU9911406/EMCEMZ3395/)
- "net_weight": string (e.g. "28.2MT" or "28,200.000 KGS")
- "container_numbers": array of strings (ISO 6346 container numbers)
- "port_of_loading": string (e.g. "PORT KLANG, MALAYSIA")
- "shipping_agent": string (shipping agent or destination agent)
- "sailing_date": string (ETD / Laden on Board / Sailing Date, keep as printed)
- "arrival_date": string (ETA / arrival date, keep as printed)

CRITICAL INSTRUCTIONS:
- Extract the FULL ADDRESS and all contact details for both shipper_name and consignee_name, not just the single company name line!
- Look carefully for Container Number / Seal Number pairs separated by slashes (e.g. CONTAINER/SEAL).

TEXT:
---
${(text || '').slice(0, 60000)}
---`;

const BL_KEYS = ['bl_number', 'vessel_name', 'shipper_name', 'consignee_name', 'seal_number', 'net_weight', 'port_of_loading', 'shipping_agent', 'sailing_date', 'arrival_date'];

function blParseJsonResponse(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
}

/** Ask the configured DeepSeek model to read the BL text. Throws on failure. */
async function blExtractWithAi(text, settings = {}) {
  const ds = resolveDeepSeek(settings);
  if (!ds.key) throw new Error('no AI key configured');
  const started = Date.now();
  const body = {
    model: ds.model,
    messages: [
      { role: 'system', content: 'You extract shipping/Bill of Lading data into JSON. Extract shipper_name (full exporter name + complete address + contacts), consignee_name (full importer name + complete address + NTN/contacts), container seal_number, vessel, bl_number, port_of_loading. Return ONLY valid JSON.' },
      { role: 'user', content: blExtractPrompt(text) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0
  };
  // DeepSeek-V4.1-Flash reasons by default on DashScope and would spend the whole
  // completion budget thinking instead of answering with JSON.
  if (/dashscope/i.test(ds.base)) body.enable_thinking = false;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let resp;
  let raw = '';
  try {
    resp = await fetch(ds.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ds.key },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    raw = await resp.text();
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new Error('AI ' + resp.status + ': ' + raw.slice(0, 200));

  let data = {};
  try { data = JSON.parse(raw); } catch (e) { data = {}; }
  const content = data?.choices?.[0]?.message?.content || '';
  recordAiCall({
    provider: 'deepseek',
    model: ds.model,
    area: 'Container BL Reader',
    isAutoFetch: false,
    prompt: text.slice(0, 2000),
    response: content.slice(0, 2000),
    tokensIn: data?.usage?.prompt_tokens || 0,
    tokensOut: data?.usage?.completion_tokens || 0,
    cachedTokens: cachedTokensFrom(data),
    durationMs: Date.now() - started
  });
  return blParseJsonResponse(content);
}

// ---------------------------------------------------------------------------
// Local (no-AI) heuristic parser — copied verbatim from the Containers & Lots
// backend so behaviour is identical.
// ---------------------------------------------------------------------------
function blExtractFieldsLocal(text) {
  const src = (text || '').replace(/\r/g, '');
  const lines = src.split('\n').map(l => l.trim()).filter(Boolean);
  const clean = (v) => String(v || '').replace(/[|_•·]/g, '').replace(/\s+/g, ' ').trim();

  // 1. Container numbers & Seal numbers
  const containerNumbers = [];
  let sealNumber = '';

  // Look for slash container/seal combo e.g. "EMCU9911406/EMCEMZ3395/" or "MSKU1234567/123456"
  const slashMatches = [...src.matchAll(/\b([A-Z]{4}\d{7})\s*[\/\-]\s*([A-Z0-9]{4,20})\b/gi)];
  for (const m of slashMatches) {
    const cNum = m[1].toUpperCase();
    if (!containerNumbers.includes(cNum)) containerNumbers.push(cNum);
    if (!sealNumber && m[2]) sealNumber = m[2].trim().toUpperCase();
  }

  // Also collect any ISO 6346 containers not matched with slash
  const allIsoContainers = (src.match(/\b[A-Z]{4}\d{7}\b/g) || []).map(c => c.toUpperCase());
  for (const c of allIsoContainers) {
    if (!containerNumbers.includes(c)) containerNumbers.push(c);
  }

  // Explicit seal number pattern if not found via slash
  if (!sealNumber) {
    const sealMatch = src.match(/(?:SEAL\s*(?:NO|NUMBER|#)?\s*[:.\-\/]?\s*)([A-Z0-9]{4,20})/i) ||
                      src.match(/\b(?:SEAL)\s*[:.\-]?\s*([A-Z0-9]{4,20})\b/i);
    if (sealMatch) sealNumber = clean(sealMatch[1]).toUpperCase();
  }

  // 2. BL Number
  const blNumber = (() => {
    // Look for explicit B/L NO. pattern first
    const blNoMatch = src.match(/(?:B\/L\s*NO\.?|BL\s*NO\.?|BILL\s*OF\s*LADING\s*NO\.?)\s*[:.]?\s*([A-Z0-9]{6,25})/i);
    if (blNoMatch && !/PROOFREAD|NON-NEGOTIABLE|ORIGINAL|COPY|DRAFT/i.test(blNoMatch[1])) {
      return clean(blNoMatch[1]);
    }
    // Standalone 10-14 digit BL number (like Evergreen 091600469446)
    const numMatch = src.match(/\b(09\d{10}|\d{12})\b/);
    if (numMatch) return numMatch[1];

    const patterns = [
      /(?:B\/L\s*(?:NO|NUMBER)?\s*[:.]?\s*)([A-Z0-9][A-Z0-9\/\- ]{4,40})/i,
      /(?:BL\s*(?:NO|NUMBER)?\s*[:.]?\s*)([A-Z0-9][A-Z0-9\/\- ]{4,40})/i,
      /(?:MBL\s*[:.]?\s*)([A-Z0-9][A-Z0-9\/\- ]{4,40})/i,
      /(?:HBL\s*[:.]?\s*)([A-Z0-9][A-Z0-9\/\- ]{4,40})/i,
      /(?:Document\s*No\.?\s*[:.]?\s*)([0-9]{8,20})/i,
    ];
    for (const re of patterns) {
      const m = src.match(re);
      if (m) {
        const v = clean(m[1]);
        if (v.length >= 5 && !/PROOFREAD|NON-NEGOTIABLE|ORIGINAL|COPY|DRAFT|CARRIER|VESSEL|CONTAINER/i.test(v)) return v;
      }
    }
    return '';
  })();

  // 3. Vessel Name
  const vesselName = (() => {
    const patterns = [
      /(?:OCEAN\s*VESSEL|VESSEL\s*\/\s*VOYAGE|VESSEL\s*NAME|VESSEL|CARRIER\s*NAME|CARRIER|M\.?\s*V\.?|MV)\s*[:.]?\s*([A-Z][A-Z0-9\s\/\.\-]{2,60})/i,
      /(?:EVER\s+[A-Z]+\s+\d+[A-Z]?)/i, // Evergreen line vessels e.g. "EVER URBAN 227W"
    ];
    for (const re of patterns) {
      const m = src.match(re);
      if (m) {
        let v = clean(m[1] || m[0]);
        v = v.replace(/\bVOY(?:AGE)?\s*[:.]?\s*[A-Z0-9\-]+\b.*$/i, '').trim();
        v = v.replace(/^\s*(?:THE\s+)?/, '');
        if (v.length >= 3) return v;
      }
    }
    return '';
  })();

  // 4. Multi-Line Entity Blocks for Shipper & Consignee
  const companyRegex = /\b([A-Z0-9][A-Z0-9\s\.\,\-\&#\(\)]{2,80}?(?:SDN\s*BHD|LIMITED|LTD|LLC|INC|CORP|COMPANY|CO\.,?|FZCO|FZE|GMBH|S\.P\.A\.|TRADING|ENTERPRISE|INDUSTRIES|SCRAP|METALS?|LOGISTICS|SHIPPING))\b/i;
  
  const entityBlocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(?:BILL OF LADING|PROOFREAD|NON-NEGOTIABLE|FREIGHT|CONTAINER|FORWARDING|PARTICULARS|\(\d+\))/i.test(line)) continue;
    if (companyRegex.test(line)) {
      const blockLines = [line];
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const nextLine = lines[j];
        if (companyRegex.test(nextLine)) break;
        if (/^\d{8,20}$|PORT KLANG|EVER URBAN|OCEAN FREIGHT|43\.0000|\bCBM\b|\bKGS\b|Laden on Board|FCL\/FCL|EMAIL:|CONTACT:/i.test(nextLine)) break;
        blockLines.push(nextLine);
      }
      entityBlocks.push(blockLines.join('\n'));
      i += (blockLines.length - 1);
    }
  }

  // Shipper name + address
  const shipperName = entityBlocks.length > 0 ? entityBlocks[0] : '';

  // Consignee name + address
  const consigneeName = entityBlocks.length > 1 ? entityBlocks[1] : '';

  // 5. Net Weight
  const netWeight = (() => {
    const patterns = [
      /(?:NET\s*WEIGHT|NET\s*W\.?\s*T\.?|WEIGHT\s*\(?\s*NET|NET)\s*[:.]?\s*([0-9][0-9,\.]*\s*(?:KGS|KG|KILOGRAM(?:ME)?S|MT|TONS?|TONNES?|LBS|LB|CBM)?)/i,
      /([0-9][0-9,\.]*\s*(?:MT|KGS)\s+[A-Z0-9\s]+GRANULES?)/i,
      /(?:GROSS\s*WEIGHT|GROSS\s*W\.?\s*T\.?|GR\.?\s*S\.?\s*S\.?\s*W\.?\s*T\.?)\s*[:.]?\s*([0-9][0-9,\.]*\s*(?:KGS|KG|MT|TONS?|TONNES?|LBS|LB)?)/i,
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?\s*KGS)/i,
    ];
    for (const re of patterns) {
      const m = src.match(re);
      if (m) return clean(m[1]);
    }
    return '';
  })();

  // 6. Port of Loading
  const portOfLoading = (() => {
    const patterns = [
      /(PORT\s+KLANG\s*,\s*MALAYSIA)/i,
      /(PORT\s+KLANG)/i,
      /(JEBEL\s+ALI\s*,\s*UAE)/i,
      /(KARACHI\s*,\s*PAKISTAN)/i,
      /\bPORT\s*OF\s*LOADING\b\s*[:.]?\s*([A-Z][A-Z\s\,\.\-]{2,60})/i,
    ];
    for (const re of patterns) {
      const m = src.match(re);
      if (m) {
        const v = clean(m[1] || m[0]).replace(/[,;].*$/, '').trim();
        if (v.length >= 3 && !/^ing$/i.test(v)) return v;
      }
    }
    return '';
  })();

  // 7. Shipping Agent
  const shippingAgent = (() => {
    const patterns = [
      /(EVERGREEN\s+MARINE\s+CORP[A-Z0-9\s\.\,\(\)]+SDN\s*BHD)/i,
      /(?:SHIPPING\s*AGENT|AGENT\s*(?:AT|IN|OF)?\s*DESTINATION|DESTINATION\s*AGENT|AGENT)\s*[:.]?\s*([A-Z][A-Z0-9\s\.\-\&]{3,80})/i,
      /([A-Z0-9\s\.\-\&\(\)]+SDN\s*BHD\s*\n?\s*Please\s*confirm\s*OK)/i,
    ];
    for (const re of patterns) {
      const m = src.match(re);
      if (m) {
        let v = clean(m[1] || m[0]).replace(/[,;].*$/, '').trim();
        v = v.replace(/\s*Please\s*confirm.*$/i, '').trim();
        if (v.length >= 3) return v;
      }
    }
    // Third company if exists (often agent)
    if (entityBlocks.length > 2) {
      return entityBlocks[2].split('\n')[0];
    }
    return '';
  })();

  // 8. Sailing Date & Arrival Date
  const sailingDate = (() => {
    const m = src.match(/(?:ETD|SAILING\s*DATE|SAILED?|Laden\s*on\s*Board)\s*[:.]?\s*([A-Za-z]{3}\.?[0-9]{1,2},?[0-9]{4}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}|[0-9]{4}[\/\-][0-9]{1,2}[\/\-][0-9]{1,2})/i) ||
              src.match(/\b(AUG\.21,2026|[A-Z]{3}\.\d{1,2},\d{4})\b/i);
    return m ? m[1] : '';
  })();

  const arrivalDate = (() => {
    const m = src.match(/(?:ETA|ARRIVAL\s*DATE|ARRIVED?)\s*[:.]?\s*([A-Za-z]{3}\.?[0-9]{1,2},?[0-9]{4}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}|[0-9]{4}[\/\-][0-9]{1,2}[\/\-][0-9]{1,2})/i);
    return m ? m[1] : '';
  })();

  return {
    bl_number: blNumber,
    vessel_name: vesselName,
    shipper_name: shipperName,
    consignee_name: consigneeName,
    seal_number: sealNumber,
    net_weight: netWeight,
    container_numbers: containerNumbers,
    port_of_loading: portOfLoading,
    shipping_agent: shippingAgent,
    sailing_date: sailingDate,
    arrival_date: arrivalDate,
  };
}

/**
 * Full extraction: AI first, then the local regex parser fills anything the AI
 * left empty — and answers alone when no AI key is configured or the call fails.
 */
export async function extractBlFields(text, settings = {}) {
  const localFields = blExtractFieldsLocal(text);
  let fields = null;
  let source = 'local';
  if (String(text || '').trim()) {
    try {
      const ai = await blExtractWithAi(text, settings);
      if (ai && typeof ai === 'object') {
        fields = ai;
        source = 'ai';
        for (const key of BL_KEYS) {
          if (!fields[key] || !String(fields[key]).trim()) fields[key] = localFields[key] || '';
        }
        if (!Array.isArray(fields.container_numbers) || fields.container_numbers.length === 0) {
          fields.container_numbers = localFields.container_numbers || [];
        }
      }
    } catch (e) {
      console.warn('[BL Extract] AI failed, using the local parser:', String(e.message || e).slice(0, 160));
    }
  }
  if (!fields) fields = localFields;
  return {
    source,
    fields: {
      bl_number: String(fields.bl_number || '').trim(),
      vessel_name: String(fields.vessel_name || '').trim(),
      shipper_name: String(fields.shipper_name || '').trim(),
      consignee_name: String(fields.consignee_name || '').trim(),
      seal_number: String(fields.seal_number || '').trim(),
      net_weight: String(fields.net_weight || '').trim(),
      container_numbers: Array.isArray(fields.container_numbers)
        ? fields.container_numbers.map(c => String(c).replace(/[^A-Za-z0-9]/g, '').toUpperCase()).filter(Boolean)
        : [],
      port_of_loading: String(fields.port_of_loading || '').trim(),
      shipping_agent: String(fields.shipping_agent || '').trim(),
      sailing_date: String(fields.sailing_date || '').trim(),
      arrival_date: String(fields.arrival_date || '').trim()
    }
  };
}
