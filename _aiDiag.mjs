// Temp diagnostic: which AI keys exist and are they working right now?
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const cfg = {
  apiKey: 'AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI',
  authDomain: 'whatanagent-a1e59.firebaseapp.com',
  projectId: 'whatanagent-a1e59',
  storageBucket: 'whatanagent-a1e59.firebasestorage.app',
  messagingSenderId: '410197132578',
  appId: '1:410197132578:web:97cfc3ae33f39ed3df917b'
};
const db = getFirestore(initializeApp(cfg));
const mask = (v) => (v ? (String(v).slice(0, 6) + '…' + String(v).slice(-4) + ' (len ' + String(v).length + ')') : '(missing)');

const s = await getDoc(doc(db, 'appData', 'settings'));
const d = s.exists() ? (s.data() || {}) : {};
console.log('=== appData/settings keys ===');
console.log('GEMINI_API_KEY    :', mask(d.GEMINI_API_KEY || d.geminiApiKey));
console.log('DEEPSEEK_API_KEY  :', mask(d.DEEPSEEK_API_KEY));
console.log('QWEN_API_KEY      :', mask(d.QWEN_API_KEY || d.DASHSCOPE_API_KEY));
console.log('QWEN_BASE_URL     :', d.QWEN_BASE_URL || '(default)');
console.log('other key-ish     :', Object.keys(d).filter(k => /key|token|secret/i.test(k)).join(', '));

const kb = await getDoc(doc(db, 'appData', 'waWebKnowledgeBase'));
const k = kb.exists() ? (kb.data() || {}) : {};
console.log('\n=== appData/waWebKnowledgeBase ===');
console.log('aiModel           :', k.aiModel || '(unset → deepseek-chat)');
console.log('autoReplyEnabled  :', k.autoReplyEnabled);
console.log('bossPhone         :', k.bossPhone || (k.bossKnowledge && k.bossKnowledge.bossPhone) || '(unset)');
console.log('mediaAiMode       :', k.mediaAiMode || '(unset)');
console.log('updatedAt         :', k.updatedAt ? new Date(k.updatedAt).toISOString() : '(none)');

// ---------- live provider tests ----------
async function testGemini(key, model) {
  if (!key) return console.log(`GEMINI ${model}: skipped (no key)`);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
    });
    const t = await r.text();
    console.log(`GEMINI ${model}: HTTP ${r.status} ${r.ok ? '✅' : '❌ ' + t.slice(0, 220).replace(/\s+/g, ' ')}`);
  } catch (e) { console.log(`GEMINI ${model}: net error ${e.message}`); }
}
async function testDeepSeek(key) {
  if (!key) return console.log('DEEPSEEK deepseek-chat: skipped (no key)');
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
    });
    const t = await r.text();
    console.log(`DEEPSEEK deepseek-chat: HTTP ${r.status} ${r.ok ? '✅' : '❌ ' + t.slice(0, 220).replace(/\s+/g, ' ')}`);
  } catch (e) { console.log('DEEPSEEK: net error ' + e.message); }
}
async function testQwen(key, base) {
  if (!key) return console.log('QWEN: skipped (no key)');
  const url = (base || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1') + '/chat/completions';
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'qwen-plus', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 })
    });
    const t = await r.text();
    console.log(`QWEN qwen-plus @ ${url}: HTTP ${r.status} ${r.ok ? '✅' : '❌ ' + t.slice(0, 220).replace(/\s+/g, ' ')}`);
  } catch (e) { console.log('QWEN: net error ' + e.message); }
}

console.log('\n=== live provider checks ===');
const gk = d.GEMINI_API_KEY || d.geminiApiKey;
for (const m of ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest']) await testGemini(gk, m);
await testDeepSeek(d.DEEPSEEK_API_KEY);
await testQwen(d.QWEN_API_KEY || d.DASHSCOPE_API_KEY, d.QWEN_BASE_URL);
process.exit(0);
