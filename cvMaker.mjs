// ============================================================================
// 🎩 AI CV MAKER — Mr. Zaheer (the default assistant) drafts a complete, ready-to-insert CV
// from a few answers: role, gender, category and what the owner wants from this person.
// The draft is returned for review; nothing is saved until the owner presses "Save CV".
// ============================================================================
import { callAgentModel } from './agentRunner.mjs';
import { tankPromptText } from './businessTank.mjs';
import { AVAILABLE_MODELS, sanitizeCv } from './agentsStore.mjs';
import { listTools } from './toolRegistry.mjs';
import { DEFAULT_AGENT } from './agentTemplates.mjs';
import { DEFAULT_TEXT_MODEL, GEMINI_TEXT_MODEL } from './aiProviders.mjs';

const sstr = (v, n = 500) => String(v == null ? '' : v).slice(0, n);

function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.substring(s, e + 1)); } catch (err) { return null; }
}

export async function generateCvDraft({ name = '', role, gender = 'neutral', category = 'business', brief = '', model = 'qwen3.8-flash' } = {}) {
  role = sstr(role, 140).trim();
  brief = sstr(brief, 3000).trim();
  if (!role) throw new Error('Role / speciality is required');
  const modelId = AVAILABLE_MODELS.some(m => m.id === model) ? model : DEFAULT_TEXT_MODEL;
  const tools = listTools();
  const toolIds = tools.map(t => t.id);

  let business = '';
  try { business = sstr(tankPromptText(), 2500); } catch (e) { business = ''; }

  const system =
    'You are ' + DEFAULT_AGENT.name + ', the boss\'s trusted all-rounder assistant at a Dubai-based trading company. ' +
    'The boss (Mr. Nadeem) is hiring a new AI staff member for the company\'s WhatsApp-based work and asked you to write the BEST possible CV / staff card for it.\n' +
    'Think like an experienced HR head: be specific, practical and realistic for WhatsApp conversations. Never invent facts about the company; ' +
    'use the business context below only when it is relevant to the role.\n\n' +
    'Return ONLY one JSON object (no markdown, no commentary) with exactly these keys:\n' +
    '{\n' +
    '  "name": "short first name, e.g. Saad (keep the boss\'s name if he gave one)",\n' +
    '  "role": "clear job title",\n' +
    '  "emoji": "one emoji avatar",\n' +
    '  "agePersona": "e.g. 30s, senior",\n' +
    '  "languages": ["..."],\n' +
    '  "defaultLanguage": "...",\n' +
    '  "jobDescription": "4-8 lines: exactly what this person owns, how they work, what good looks like",\n' +
    '  "tone": "speaking style in one sentence",\n' +
    '  "workingHours": "...",\n' +
    '  "traits": ["5-7 short traits"],\n' +
    '  "signaturePhrases": ["3-5 short phrases they naturally use"],\n' +
    '  "emojiHabit": "how they use emojis",\n' +
    '  "backstory": "2-3 sentences of professional background",\n' +
    '  "guardrails": { "always": ["5-8 rules"], "never": ["5-8 rules"], "escalation": ["4-6 situations to hand over to the boss"], "disclaimers": ["0-3 required disclaimers"] },\n' +
    '  "allowedTools": ["only ids from the allowed list below, least privilege"],\n' +
    '  "systemPrompt": "the full role instructions that start with \'You are <name>, ...\' (15-30 lines, second person, concrete do/don\'t, reply-length and language rules)"\n' +
    '}\n' +
    'Rules: write in English; the default language and the languages list must suit WhatsApp customers in the UAE/Pakistan/India region (e.g. English, Roman Urdu, Urdu). ' +
    'Never use Devanagari/Hindi script. Staff must be honest if asked what they are, never promise prices/discounts/delivery they cannot confirm, ' +
    'and must escalate money, legal, complaint and unknown-fact questions to the boss.\n' +
    'ALLOWED TOOL IDS: ' + tools.map(t => t.id + ' (' + t.riskLevel + ': ' + sstr(t.description, 80) + ')').join('; ') + '\n' +
    (business ? '\nBUSINESS CONTEXT (from the Business Data Tank):\n' + business + '\n' : '');

  const user =
    'Please make the best CV for this new staff member.\n' +
    'Role / speciality: ' + role + '\n' +
    'Gender: ' + gender + '\n' +
    'Category: ' + category + ' (business = customer/sales work, knowledge = research/information work, personal = private helper assigned manually)\n' +
    (name ? 'Name chosen by the boss: ' + sstr(name, 60) + '\n' : 'Name: choose a fitting one.\n') +
    'What the boss wants from this person:\n' + (brief || '(no extra detail — use best practice for the role)');

  const r = await callAgentModel({
    system,
    messages: [{ role: 'user', content: user }],
    model: modelId,
    fallbackModel: modelId === GEMINI_TEXT_MODEL ? DEFAULT_TEXT_MODEL : GEMINI_TEXT_MODEL,
    temperature: 0.6,
    maxTokens: 3500,
    agentName: DEFAULT_AGENT.name,
    purpose: 'cv-maker'
  });

  const j = extractJson(r.text);
  if (!j || typeof j !== 'object') throw new Error('The AI did not return a usable CV — try again or pick another model.');

  const cv = sanitizeCv({
    ...j,
    name: name || j.name,
    role: j.role || role,
    gender,
    category,
    model: 'qwen3.8-flash',
    allowedTools: (Array.isArray(j.allowedTools) ? j.allowedTools : []).filter(id => toolIds.includes(id)),
    sourceAgentId: '',
    isDefaultAgent: false
  });
  cv.title = cv.name + (cv.role ? ' — ' + cv.role : '');
  return { cv, usedModel: r.model, usedFallback: !!r.usedFallback };
}
