// Temp: focused provider probe with hard timeouts.
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
const d = (await getDoc(doc(db, 'appData', 'settings'))).data() || {};
const GK = d.GEMINI_API_KEY || d.geminiApiKey;
const DK = d.DEEPSEEK_API_KEY;
const QK = d.QWEN_API_KEY || d.DASHSCOPE_API_KEY;
const QB = d.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

async function post(url, headers, body, label) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    const txt = await r.text();
    const short = txt.replace(/\s+/g, ' ').slice(0, 200);
    console.log(`${label}: HTTP ${r.status} ${r.ok ? '✅' : '❌ ' + short}`);
  } catch (e) {
    console.log(`${label}: ❌ ${e.name === 'AbortError' ? 'TIMEOUT 20s' : e.message}`);
  } finally { clearTimeout(t); }
}

console.log('=== GEMINI (2 attempts each) ===');
for (const m of ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview']) {
  for (let i = 1; i <= 2; i++) {
    await post(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GK}`,
      { 'Content-Type': 'application/json' }, { contents: [{ parts: [{ text: 'ping' }] }] }, `GEMINI ${m} #${i}`);
  }
}

console.log('\n=== QWEN (dashscope compatible) ===');
for (const m of ['qwen3.8-flash', 'qwen-plus', 'qwen-flash', 'qwen3-max']) {
  await post(`${QB}/chat/completions`,
    { 'Content-Type': 'application/json', Authorization: 'Bearer ' + QK },
    { model: m, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }, `QWEN ${m}`);
}

console.log('\n=== DEEPSEEK ===');
await post('https://api.deepseek.com/chat/completions',
  { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DK },
  { model: 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }, 'DEEPSEEK deepseek-chat');
process.exit(0);
