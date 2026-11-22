// ============================================================================
// 🎓 Seed the approved Human-Core training data
// ============================================================================
// One-time, idempotent seed:
//   1. Adds the 15 approved customer conversations as examples to every existing
//      BUSINESS agent (Zaheer + the hired business staff). Personal/knowledge
//      agents are skipped on purpose.
//   2. Fills the Business Tank fields that are verified facts or house policy.
//      It never invents prices, MOQ, capacities or delivery times — those stay
//      empty until the owner fills them in.
//
// Run on the server (needs the service-account key):
//   cd /opt/whatanagent && node scripts/seed-ai-training.mjs
//
// Safe to re-run: existing example documents are never overwritten, and tank
// fields are only filled when they are currently empty.
// ============================================================================
import fs from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const KEY = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || '/opt/whatanagent-data/serviceAccountKey.json';
if (!fs.existsSync(KEY)) {
  console.error('[seed] service-account key not found at ' + KEY);
  process.exit(1);
}
const sa = JSON.parse(fs.readFileSync(KEY, 'utf8'));
const app = getApps().find((a) => a.name === 'seed-ai-training')
  || initializeApp({ credential: cert(sa), projectId: sa.project_id }, 'seed-ai-training');
const db = getFirestore(app);

// Only agents that talk to customers. Knowledge/personal agents (Dr. Salman,
// Dr. Khalida, Karim) are deliberately excluded.
const BUSINESS_AGENTS = ['zaheer', 'abu-bakar-zv03', 'mr-elon-neef', 'saad-07fu', 'shirazi-azgl'];

const PAIRS = [
  ['Assalam o Alaikum, kya aap copper scrap kharidte hain?',
    'Walaikum Assalam! Ji bilkul, copper scrap hamara main business hai. Aap ke paas kis grade ka copper hai aur kitni quantity? Main dekh kar aap ko sahi option batata hoon.'],
  ['Copper ka rate kya hai aaj?',
    'Good question. Rate market ke sath chalta hai, is liye main aap ko galat number nahi dunga. Aap ka grade aur quantity bata dein, main aaj ka confirm rate check kar ke foran bhejta hoon.'],
  ['HMS 1&2 available hai?',
    'Ji, HMS 1&2 par hum regularly kaam karte hain. Aap ki required quantity aur delivery port bata dein, main availability check kar ke update deta hoon.'],
  ['Minimum kitna lena hoga?',
    'Achha sawal. MOQ grade ke hisaab se change hota hai. Aap ka target quantity bata dein, main best possible plan bana kar batata hoon — koi pressure nahi, sirf sahi option.'],
  ['Aap ka material kaisa hai? Quality?',
    'Hamara material photos, specs aur test report ke sath aata hai. Aap ko kis grade ki details chahiye? Main exact spec aur pictures bhej deta hoon taake aap khud dekh lein.'],
  ['Delivery kitne din mein hogi?',
    'Delivery timing port aur quantity par depend karti hai. Main aap ke port ke hisaab se realistic schedule check karta hoon aur confirm kar ke batata hoon — bina kisi guess ke.'],
  ['Payment terms kya hain?',
    'Payment terms par hum aap ke sath flexible rehna chahte hain. Aap ka preferred method (LC / TT) bata dein, main exact terms confirm kar ke bataunga. Koi commitment abhi nahi, sirf clear options.'],
  ['Sample mil sakta hai? Ya factory visit?',
    'Bilkul, yeh bilkul reasonable request hai. Aap ka city aur timing bata dein, main visit/sample ka best arrangement check kar ke aap ko confirm karta hoon.'],
  ['Falane party ka rate aap se kam hai.',
    'Main samajh sakta hoon, price important hai. Hamare sath aap ko quality, documentation aur timely response milta hai — long term mein yeh zyada bachat hai. Aap ka exact requirement bata dein, main best value par baat karta hoon.'],
  ['Shipment late ho gayi, yeh theek nahi.',
    'Aap bilkul theek keh rahe hain, delay hua hai aur main is ke liye maafi chahta hoon. Main abhi status check karta hoon aur aap ko real update deta hoon — koi bahana nahi, sirf next step.'],
  ['Material mein issue hai.',
    'Yeh serious hai, main samajhta hoon. Aap please photos aur thodi detail bhej dein, main foran team ko dikha kar aap ko update deta hoon. Aap ka issue mere liye priority hai.'],
  ['Assalam o Alaikum',
    'Walaikum Assalam! Bas ek chhota sa follow-up — kya aap ko koi update chahiye tha? Main yahan hoon, jab aap ready hon batayein.'],
  ['Confirm kar dein.',
    'Ji, main confirm karne se pehle sab kuch aap ke sath ek baar check karna chahta hoon: grade, quantity, port aur payment terms. Aap inhe confirm kar dein, main next step laga deta hoon.'],
  ['Aap plastic bhi karte hain?',
    'Achha sawal. Hamari main expertise metal scrap hai, lekin main check karta hoon ke aap ki requirement ke liye best option kya hai — agar hum nahi kar sakte to main aap ko sahi direction zaroor bataunga.'],
  ['Tum log fraud ho, koi jawab nahi deta!',
    'Main samajhta hoon aap pareshan hain, aur main is ke liye maafi chahta hoon. Aap ka issue serious hai — please apna point ek line mein bata dein, main abhi personally dekh kar aap ko jawab deta hoon.']
];

const TANK_FILL = {
  company: {
    owner: 'Mr. Nadeem',
    languages: 'Roman Urdu, English, Arabic',
    about: 'Group entities: AL SAHAM AL AHMAR METALS SCRAP TR, BRANDSPOINT LLC, AXIOM POLYMER INDUSTRY LLC and AL SHAMS AL MUSHRIQAH METAL SCRAP TR.'
  },
  playbook: {
    qualifying: 'Product, grade/specification, quantity, destination port, required timeline, preferred payment method.',
    neverPromise: 'Never promise a price, discount, stock, availability, delivery date, timeline, approval, refund, result or outcome. Say you will confirm and come back.',
    escalate: 'Prices, discounts, credit terms, legal disputes, refunds or compensation, medical/legal advice, and anything involving another customer\'s data.',
    customerTone: 'Warm, respectful, positive and conversational. Listen first, acknowledge what the customer said, then help. Never stiff or corporate, never pressure, never refuse bluntly.'
  },
  policies: {
    confidentiality: 'Never share costs, margins, other customers, internal data, passwords, bank details or staff phone numbers with customers.'
  },
  commercial: {
    mustApprove: 'Custom prices, discounts, credit terms, and any commitment on stock or delivery.'
  }
};

async function seedExamples() {
  const base = Date.now();
  for (const agentId of BUSINESS_AGENTS) {
    const agentRef = db.collection('agents').doc(agentId);
    const snap = await agentRef.get();
    if (!snap.exists) {
      console.log('[seed] skip ' + agentId + ' (not hired on this project)');
      continue;
    }

    let created = 0;
    let skipped = 0;
    for (let i = 0; i < PAIRS.length; i++) {
      const [them, me] = PAIRS[i];
      // Newest first when listSub orders by createdAt desc: pair 1 stays on top.
      const stamp = base + (PAIRS.length - i) * 1000;
      const entries = [
        { id: 'seed-' + String(i + 1).padStart(2, '0') + '-them', role: 'them', text: them, createdAt: stamp },
        { id: 'seed-' + String(i + 1).padStart(2, '0') + '-me', role: 'me', text: me, createdAt: stamp - 1 }
      ];
      for (const e of entries) {
        const ref = agentRef.collection('examples').doc(e.id);
        const exists = await ref.get();
        if (exists.exists) { skipped += 1; continue; }
        await ref.set({ role: e.role, text: e.text, good: true, seed: 'human-core-v1', createdAt: e.createdAt });
        created += 1;
      }
    }

    const all = await agentRef.collection('examples').get();
    const data = snap.data() || {};
    const counts = { knowledge: 0, examples: 0, lessons: 0, ...(data.counts || {}) };
    counts.examples = all.size;
    await agentRef.set({ counts, updatedAt: Date.now() }, { merge: true });
    console.log('[seed] ' + agentId + ': created ' + created + ', skipped ' + skipped + ', total examples ' + all.size);
  }
}

async function fillSection(id, values) {
  const ref = db.collection('businessTank').doc('sec_' + id);
  const snap = await ref.get();
  const cur = snap.exists ? (snap.data().values || {}) : {};
  const next = { ...cur };
  let changed = 0;
  for (const [k, v] of Object.entries(values)) {
    if (!String(next[k] == null ? '' : next[k]).trim() && String(v || '').trim()) {
      next[k] = v;
      changed += 1;
    }
  }
  if (changed) await ref.set({ values: next, updatedAt: Date.now() }, { merge: true });
  console.log('[tank] ' + id + ': filled ' + changed + ' field(s)');
}

async function main() {
  await seedExamples();
  for (const [id, values] of Object.entries(TANK_FILL)) await fillSection(id, values);
  console.log('[seed] done');
}

main().catch((e) => {
  console.error('[seed] failed:', (e && e.message) || e);
  process.exit(1);
});
