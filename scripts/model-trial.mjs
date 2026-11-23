// ============================================================================
// 🧪 Model trial — same real prompt, several engines, one report
// ============================================================================
// Sends the SAME customer messages through the app's own sandbox endpoint
// (`POST /api/wa-web/knowledge-base/test`), which builds the real prompt from
// the live knowledge base + persona + rules. So the comparison is faithful:
// only the engine changes.
//
//   node scripts/model-trial.mjs                      # live server
//   node scripts/model-trial.mjs http://127.0.0.1:3000
//
// Prices are USD per 1M tokens (official Gemini pricing page, Standard tier),
// plus the Qwen baseline this app already uses. A model with no published
// price prints "n/a" instead of a guessed number.
const PRICES = {
  'qwen3.8-flash':         { in: 0.16, out: 0.47 },
  'gemini-2.5-flash':      { in: 0.30, out: 2.50 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
  'gemini-3.5-flash':      null,                       // legacy id, price not published
  'gemini-3.6-flash':      { in: 0.75, out: 3.75 },
  'gemini-3.8-flash':      { in: 0.75, out: 3.75 },
  // 🆓 Free on Z.ai's pricing page (input, cached input and output all $0).
  // Needs ZAI_API_KEY in the server environment or the call returns an error.
  'glm-4.7-flash':         { in: 0, out: 0 },
  'glm-4.5-flash':         { in: 0, out: 0 },
  'glm-4.6v-flash':        { in: 0, out: 0 }
};

const BASE = (process.argv[2] || 'https://whatanagent.duckdns.org').replace(/\/+$/, '');

const MESSAGES = [
  'bhai rate kya hai pp granules ka? 20 ton chahiye port qasim',
  'salam, kal ke liye container ready hoga? loading urgent karni hai',
  'Assalam o alaikum, apke plastic scrap ka quotation chahiye'
];

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });
  return r.json();
}

function tokensFrom(usage) {
  if (!usage) return { inTok: 0, outTok: 0 };
  const inTok = usage.promptTokenCount ?? usage.prompt_tokens ?? 0;
  const outTok = usage.candidatesTokenCount ?? usage.completion_tokens ?? 0;
  return { inTok, outTok };
}

function money(n) { return '$' + n.toFixed(6); }

(async () => {
  const kbRes = await fetch(BASE + '/api/wa-web/knowledge-base');
  const kb = (await kbRes.json()).knowledge || {};
  console.log('Knowledge base loaded (persona / rules / products applied to every call).\n');

  const models = Object.keys(PRICES);
  const rows = [];

  for (const model of models) {
    const isQwen = model.startsWith('qwen');
    let totalIn = 0, totalOut = 0, totalMs = 0, ok = 0;
    const replies = [];

    for (const msg of MESSAGES) {
      const body = isQwen
        ? { message: msg, knowledge: { ...kb, aiModel: model } }
        : { message: msg, knowledge: kb, model };
      const t0 = Date.now();
      let d;
      try {
        d = await post('/api/wa-web/knowledge-base/test', body);
      } catch (e) {
        d = { error: e.message };
      }
      const ms = Date.now() - t0;
      if (d.error) {
        replies.push({ msg, error: String(d.error).slice(0, 160) });
        continue;
      }
      const { inTok, outTok } = tokensFrom(d.usage);
      totalIn += inTok; totalOut += outTok; totalMs += ms; ok += 1;
      replies.push({ msg, reply: String(d.reply || ''), inTok, outTok, ms });
      // Print as we go: a slow model must not hide the results of the fast ones.
      console.log('[' + model + ' ' + (replies.length) + '/' + MESSAGES.length + '] ' +
        inTok + ' in / ' + outTok + ' out · ' + ms + ' ms');
    }

    rows.push({ model, totalIn, totalOut, totalMs, ok, replies });
  }

  console.log('================ REPLIES ================');
  for (const r of rows) {
    console.log('\n### ' + r.model + '  (' + r.ok + '/' + MESSAGES.length + ' answered)');
    r.replies.forEach((x, i) => {
      console.log('\n[' + (i + 1) + '] ' + x.msg);
      if (x.error) { console.log('    ERROR: ' + x.error); return; }
      console.log('    ' + x.reply.replace(/\n/g, '\n    '));
      console.log('    (' + x.inTok + ' in / ' + x.outTok + ' out · ' + x.ms + ' ms)');
    });
  }

  console.log('\n================ COST ================');
  console.log('model'.padEnd(24) + 'answers  avg in  avg out  avg ms  cost/call   cost/1000');
  for (const r of rows) {
    const n = r.ok || 1;
    const p = PRICES[r.model];
    const perCall = p ? (r.totalIn / n) / 1e6 * p.in + (r.totalOut / n) / 1e6 * p.out : null;
    console.log(
      r.model.padEnd(24) +
      String(r.ok + '/' + MESSAGES.length).padEnd(9) +
      String(Math.round(r.totalIn / n)).padEnd(9) +
      String(Math.round(r.totalOut / n)).padEnd(9) +
      String(r.ok ? Math.round(r.totalMs / n) : 0).padEnd(8) +
      (perCall == null ? 'n/a' : money(perCall)).padEnd(12) +
      (perCall == null ? 'n/a' : '$' + (perCall * 1000).toFixed(2))
    );
  }
  console.log('\nMeasured on the live prompt, so "avg in" is your real transcript-sized cost.');
  console.log('cost/1000 = what 1,000 replies like these would cost on that engine.');
})();
