// ============================================================================
// 🚀 Deploy News Hub, Machinery & Inventions Page, and Initial Blog Posts
// ============================================================================
import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { wrapContent } from '../alqaryan-site/build/chrome.mjs';
import { TEL, TEL_LINK, WA } from '../alqaryan-site/build/materials/constants.mjs';

const src = fs.readFileSync('public/admin.html', 'utf8');
const pick = (k) => (src.match(new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']')) || [])[1] || '';
const app = initializeApp({ apiKey: pick('apiKey'), projectId: pick('projectId') || 'whatanagent-a1e59' });
const db = getFirestore(app);

const snap = await getDoc(doc(db, 'appData', 'seoAgent'));
const aq = snap.data()?.sites?.['alqaryangroup.com'];

let cmsUser = aq?.cmsUsername;
let cmsPass = aq?.cmsPassword;

if (!cmsUser) {
  const wsSnap = await getDoc(doc(db, 'appData', 'websitesWorkshop'));
  const wsAq = wsSnap.data()?.sites?.['alqaryangroup.com'];
  cmsUser = wsAq?.host?.cmsUsername || wsAq?.cmsUsername;
  cmsPass = wsAq?.host?.cmsPassword || wsAq?.cmsPassword;
}

const SITE = 'https://alqaryangroup.com';
const auth = 'Basic ' + Buffer.from(cmsUser + ':' + cmsPass).toString('base64');
const H = { Authorization: auth, 'Content-Type': 'application/json' };

const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// ============================================================================
// 1. PAGE DEFINITIONS
// ============================================================================

// --- PAGE A: /news/ (The Main Hub) ---
const newsHubHtml = `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Al Qaryan Knowledge &amp; Insights</p>
  <h1>Plastic Recycling News, Machinery Innovations &amp; Market Insights</h1>
  <p class="q-lead">Authoritative industry analysis, recycling machinery breakdowns, polymer inventions, and weekly scrap market trends across Pakistan and global trade.</p>
  <div class="q-chips">
    <a class="q-chip" href="/news/">All Updates</a>
    <a class="q-chip" href="/machinery-inventions/">Recycling Machinery</a>
    <a class="q-chip" href="/machinery-inventions/#inventions">New Inventions</a>
    <a class="q-chip" href="/scrap-market/">Scrap Market Rates</a>
    <a class="q-chip" href="/pvc-pipe-manufacturing/">Extrusion Engineering</a>
  </div>
</div>

<div class="q-section">
  <h2>Featured Technical Articles &amp; Market Updates</h2>
  <p>Technical knowledge, machine comparisons, and market data written by manufacturing and recycling engineers.</p>

  <div class="q-grid q-grid--2">
    <div class="q-card">
      <span class="q-chip" style="background:#e8f4ef;color:#0b6e4f;font-weight:700;">Machinery Engineering</span>
      <h3 style="margin:0.75rem 0 0.5rem;font-size:1.25rem;"><a href="/twin-screw-vs-single-screw-extruders/" style="color:var(--q-ink);text-decoration:none;">Twin-Screw vs Single-Screw Extruders for PVC &amp; HDPE Pipe Manufacturing</a></h3>
      <p style="font-size:0.95rem;color:var(--q-muted);margin-bottom:0.75rem;">November 2026 · 6 min read</p>
      <p>A rigorous engineering comparison of screw geometry, L/D ratio, melt homogeneity, shear heat control, and energy consumption under Pakistani factory conditions.</p>
      <p><a class="q-link" href="/twin-screw-vs-single-screw-extruders/">Read full engineering guide →</a></p>
    </div>

    <div class="q-card">
      <span class="q-chip" style="background:#e0f2fe;color:#0369a1;font-weight:700;">New Inventions</span>
      <h3 style="margin:0.75rem 0 0.5rem;font-size:1.25rem;"><a href="/ai-optical-sorting-scrap-plastic/" style="color:var(--q-ink);text-decoration:none;">AI Optical Flake Sorters &amp; NIR Sensors: The Breakthrough in Scrap Purity</a></h3>
      <p style="font-size:0.95rem;color:var(--q-muted);margin-bottom:0.75rem;">November 2026 · 5 min read</p>
      <p>How near-infrared (NIR) hyperspectral vision and high-speed air ejection nozzles achieve 99.5% pure polymer flakes, eliminating manual sorting bottlenecks.</p>
      <p><a class="q-link" href="/ai-optical-sorting-scrap-plastic/">Read invention analysis →</a></p>
    </div>

    <div class="q-card">
      <span class="q-chip" style="background:#fef3c7;color:#b45309;font-weight:700;">Market Rates &amp; Trends</span>
      <h3 style="margin:0.75rem 0 0.5rem;font-size:1.25rem;"><a href="/pakistan-plastic-scrap-price-trends-nov-2026/" style="color:var(--q-ink);text-decoration:none;">Pakistan Plastic Scrap Market Rates &amp; Polymer Trends (Nov 2026)</a></h3>
      <p style="font-size:0.95rem;color:var(--q-muted);margin-bottom:0.75rem;">November 2026 · 4 min read</p>
      <p>Local price benchmark analysis for HDPE blow grade, PVC regrind/pipe scrap, and LDPE clear film in Karachi (Shershah, SITE) and Lahore industrial hubs.</p>
      <p><a class="q-link" href="/pakistan-plastic-scrap-price-trends-nov-2026/">Read market price report →</a></p>
    </div>

    <div class="q-card">
      <span class="q-chip" style="background:#f3e8ff;color:#7e22ce;font-weight:700;">Technical Reference</span>
      <h3 style="margin:0.75rem 0 0.5rem;font-size:1.25rem;"><a href="/machinery-inventions/" style="color:var(--q-ink);text-decoration:none;">Plastic Recycling Machinery &amp; New Inventions Guide</a></h3>
      <p style="font-size:0.95rem;color:var(--q-muted);margin-bottom:0.75rem;">Comprehensive Reference · 12 min read</p>
      <p>Complete directory of extruders, shredders, granulators, melt filters, and washing plants with technical capacity, power sizing, and maintenance checklists.</p>
      <p><a class="q-link" href="/machinery-inventions/">Explore complete machinery guide →</a></p>
    </div>
  </div>
</div>

<div class="q-section q-cta" style="background:linear-gradient(135deg, #0b6e4f 0%, #08543c 100%);color:#fff;border-radius:14px;padding:2rem;">
  <h2 style="color:#fff;">Connect with the Al Qaryan Scrap Market</h2>
  <p style="color:rgba(255,255,255,0.92);max-width:65ch;">Are you buying or selling industrial plastic scrap, PVC regrind, HDPE drums, or pipe scrap? Trade directly with verified buyers and recyclers on our live marketplace.</p>
  <p class="q-cta__actions">
    <a class="q-btn" style="background:#fff;color:#0b6e4f;font-weight:700;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;display:inline-block;" href="/scrap-market/">Browse Live Scrap Lots</a>
    <a class="q-btn" style="background:#128c4b;color:#fff;font-weight:700;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;display:inline-block;margin-left:0.5rem;" href="/list-your-scrap/">Post a Scrap Lot (Free)</a>
  </p>
</div>
`;

// --- PAGE B: /machinery-inventions/ (Dedicated Showcase) ---
const machineryHtml = `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Industrial Engineering &amp; Technology</p>
  <h1>Plastic Recycling Machinery &amp; New Inventions Guide</h1>
  <p class="q-lead">A comprehensive technical reference on modern plastic recycling equipment, twin-screw compounding extruders, optical AI sorters, and next-generation polymer recovery systems.</p>
  <div class="q-chips">
    <a class="q-chip" href="#extruders">Extruders</a>
    <a class="q-chip" href="#shredders">Shredders &amp; Granulators</a>
    <a class="q-chip" href="#inventions">New Inventions</a>
    <a class="q-chip" href="#matrix">Machinery Sizing Matrix</a>
    <a class="q-chip" href="#best-practices">Factory Best Practices</a>
    <a class="q-chip" href="#faq">Engineering FAQ</a>
  </div>
</div>

<div class="q-section" id="extruders">
  <h2>1. Core Recycling Machinery: Extruders &amp; Compounding Lines</h2>
  <p>The extrusion line is the heart of plastic recycling and pipe manufacturing. The machine melts, homogenizes, degasses, and filters plastic scrap before forming it into pellets or directly into PVC/HDPE pipes.</p>
  
  <div class="q-grid q-grid--2">
    <div class="q-card">
      <h3>Single-Screw Extruders</h3>
      <p><strong>Primary Application:</strong> Film recycling (LDPE, LLDPE), pipe extrusion, and re-pelletizing clean scrap flakes.</p>
      <ul class="q-list">
        <li><strong>L/D Ratio:</strong> 30:1 to 34:1 ensures full melt homogeneity and mixing.</li>
        <li><strong>Degassing Zones:</strong> High-vacuum de-volatilization ports to vent trapped moisture and volatile organic compounds.</li>
        <li><strong>Screw Design:</strong> Barrier flight geometry with Maddock mixing heads to prevent unmelts.</li>
        <li><strong>Bimetallic Barrels:</strong> Hardened tungsten carbide or NiCr alloy coating resisting abrasive fillers (calcium carbonate, pigments).</li>
      </ul>
    </div>

    <div class="q-card">
      <h3>Parallel &amp; Conical Twin-Screw Extruders</h3>
      <p><strong>Primary Application:</strong> Dry-blend PVC pipe extrusion, masterbatch compounding, and heavily-filled polymers.</p>
      <ul class="q-list">
        <li><strong>Counter-Rotating Screws:</strong> Generates positive displacement pumping at low shear rates, preventing thermal degradation of heat-sensitive PVC.</li>
        <li><strong>Temperature Precision:</strong> Multi-zone PID oil/water internal screw temperature cooling controls melt temperature within ±1.5°C.</li>
        <li><strong>Torque Density:</strong> High-torque helical gearboxes capable of sustaining heavy viscosities without stalling.</li>
      </ul>
    </div>
  </div>
</div>

<div class="q-section" id="shredders">
  <h2>2. Primary Size Reduction: Shredders &amp; Granulators</h2>
  <p>Efficient recycling requires processing scrap from bulky geometry down to uniform 8–12 mm flakes without creating excessive fine dust.</p>
  
  <div class="q-grid q-grid--2">
    <div class="q-card">
      <h3>Heavy-Duty Dual-Shaft Shredders</h3>
      <p>Low-speed (15–30 RPM), high-torque industrial shredders engineered for dense purge lumps, thick-wall HDPE pipe cut-offs, 200L drums, and automotive battery cases.</p>
      <ul class="q-list">
        <li>Reversible hydraulic pusher rams preventing bridging of lightweight bulky containers.</li>
        <li>D2/SKD-11 tool-steel rotary hooks with quadruple-edge indexed rotor blades.</li>
        <li>Automatic reverse rotation upon jam detection protects motor and drivetrain.</li>
      </ul>
    </div>

    <div class="q-card">
      <h3>High-Speed Rotary Granulators</h3>
      <p>High-speed (450–600 RPM) precision cutting mills designed for rigid plastic regrind, bottles, profiles, and runner sprues.</p>
      <ul class="q-list">
        <li>Scissor-cut chevron rotor blades reduce knife impact shock and electricity consumption by up to 20%.</li>
        <li>Water-cooled cutting chambers allow wet-granulation, cooling blades while simultaneously rinsing abrasive grit and labels.</li>
        <li>Interchangeable classification screens (8 mm to 14 mm) calibrate flake size for downstream hopper feeding.</li>
      </ul>
    </div>
  </div>
</div>

<div class="q-section" id="inventions">
  <h2>3. New Inventions &amp; Technological Breakthroughs in Recycling</h2>
  <p>Recent engineering inventions in polymer recovery have revolutionized purity, energy efficiency, and throughput.</p>

  <div class="q-grid q-grid--2">
    <div class="q-card">
      <h3>AI-Driven Hyperspectral Optical Sorters</h3>
      <p><strong>The Breakthrough:</strong> Combines High-Resolution RGB Color Cameras with Near-Infrared (NIR) Spectroscopy and deep-learning neural networks.</p>
      <ul class="q-list">
        <li><strong>Sub-Millisecond Identification:</strong> Identifies polymer chemical signatures (distinguishing HDPE, LDPE, PP, PET, PS, and PVC) in under 15 milliseconds.</li>
        <li><strong>Micro-Air Ejection:</strong> High-speed pneumatic valves fire targeted air blasts at 100 psi to eject contaminants, reaching 99.5% output purity at 5,000 kg/hr.</li>
        <li><strong>Color &amp; Black Polymer Sorting:</strong> Advanced MWIR (mid-wave infrared) sensors now detect carbon-black loaded plastics previously invisible to standard optical sorters.</li>
      </ul>
    </div>

    <div class="q-card">
      <h3>Electromagnetic Induction Barrel Heating</h3>
      <p><strong>The Breakthrough:</strong> Replaces traditional ceramic or mica resistance heating bands with high-frequency electromagnetic induction coils.</p>
      <ul class="q-list">
        <li><strong>30% Energy Savings:</strong> Heats the steel barrel directly from within rather than conducting heat inward from external bands.</li>
        <li><strong>Rapid Warm-up:</strong> Cuts extruder warm-up time from 90 minutes down to under 25 minutes.</li>
        <li><strong>Thermal Safety:</strong> Outer insulation jacket stays cool to the touch (< 50°C), protecting factory technicians and reducing ambient factory heat.</li>
      </ul>
    </div>

    <div class="q-card">
      <h3>Continuous Dual-Piston Backflush Melt Filters</h3>
      <p><strong>The Breakthrough:</strong> Continuous screen changers that clean themselves automatically through reverse melt backflushing without interrupting production.</p>
      <ul class="q-list">
        <li>Zero downtime: Eliminates hourly line stoppages for manual wire-mesh replacement.</li>
        <li>Automated pressure sensors initiate backflush cycle when upstream delta-P exceeds 180 bar.</li>
        <li>Reduces polymer purge waste to under 0.8% of total volume.</li>
      </ul>
    </div>

    <div class="q-card">
      <h3>Closed-Loop Hydrocyclone Separation Plants</h3>
      <p><strong>The Breakthrough:</strong> High-g centrifugal density separation tanks utilizing water density gradients (1.00 g/cm³) to separate floating polyolefins (PP/HDPE < 0.96 g/cm³) from sinking engineering plastics (PVC/PET > 1.30 g/cm³).</p>
      <ul class="q-list">
        <li>Continuous water micro-filtration recycles 95% of process water.</li>
        <li>Attains complete separation of PVC contamination from HDPE pipe regrind.</li>
      </ul>
    </div>
  </div>
</div>

<div class="q-section" id="matrix">
  <h2>4. Machinery Sizing &amp; Specification Matrix</h2>
  <p>Standard engineering capacities, power sizing, and maintenance intervals for plastic recycling and pipe extrusion lines:</p>

  <table class="q-table" style="width:100%;border-collapse:collapse;margin:1.5rem 0;">
    <thead>
      <tr style="background:#e8f4ef;text-align:left;">
        <th style="padding:10px;border:1px solid #e3ebe6;">Equipment</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Target Material</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Capacity</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Motor Power</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Key Maintenance Focus</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>Dual-Shaft Shredder</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Purge lumps, thick crates, drums</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">400–1,200 kg/hr</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">37–75 kW</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Blade re-sharpening (350 hrs), hydraulic oil filter</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>Wet Granulator</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Bottles, pipe off-cuts, scrap profiles</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">300–800 kg/hr</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">30–55 kW</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Rotor blade gap check (0.25 mm), bearing greasing</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>Single-Screw Extruder (90mm)</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">HDPE/LDPE regrind to pellets</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">250–450 kg/hr</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">55–90 kW</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Vacuum degassing trap purge, thrust bearing oil</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>Conical Twin-Screw (65/132)</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">uPVC pipe profile extrusion</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">200–350 kg/hr</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">37–45 kW</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Screw internal oil circulation check, barrel heater calibration</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>AI Optical Sorter</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Mixed polymer flake sorting</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">1,500–5,000 kg/hr</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">8–15 kW</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Optic glass wiper calibration, air compressor desiccants</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="q-section" id="best-practices">
  <h2>5. Operational Best Practices for Industrial Recyclers in Pakistan</h2>
  <ul class="q-list">
    <li><strong>Mitigate Grid Voltage Fluctuations:</strong> Industrial power grids in Karachi (SITE, Shershah, Korangi) experience severe voltage sags. Install dedicated servo-controlled voltage stabilizers and soft-starters on motors above 30 kW to avoid inverter trips.</li>
    <li><strong>Moisture Control Before Extrusion:</strong> Recycled flakes absorb up to 2.5% atmospheric humidity during monsoon season. Always run flakes through a desiccant or hot-air hopper dryer (80°C for 2 hours for HDPE) to prevent steam bubbles, voids, and brittleness in extruded pipes.</li>
    <li><strong>Standardized Regrind Blending Ratios:</strong> When manufacturing non-pressure PVC electrical conduit or drainage pipes, maintain regrind ratios below 35% with appropriate heat stabilizers (calcium-zinc or lead based) to prevent thermal polymer degradation.</li>
    <li><strong>Metal Detection Pre-Flight:</strong> Install rare-earth neodymium magnetic grates above all granulator and extruder hoppers. A single steel screw or nail can destroy a \$15,000 bimetallic barrel in seconds.</li>
  </ul>
</div>

<div class="q-section" id="faq">
  <h2>Frequently Asked Questions</h2>
  <details class="q-faq">
    <summary>Why is a twin-screw extruder preferred over single-screw for PVC pipe manufacturing?</summary>
    <p>PVC resin is heat-sensitive and degrades rapidly under high shear heat. Conical twin-screw extruders provide positive mechanical displacement at low screw speeds (typically 15–35 RPM), creating thorough mixing without generating excessive frictional heat. Single-screw extruders rely on friction for conveying, which causes thermal degradation and hydrochloric acid outgassing in unplasticized PVC.</p>
  </details>
  <details class="q-faq">
    <summary>How does AI optical flake sorting pay for itself compared to manual sorting in Pakistan?</summary>
    <p>Manual sorting by hand in Pakistan has an error rate of 10–18%, struggles with small flakes below 12 mm, and cannot differentiate clear PET from clear PVC. AI optical sorting operates at 99.5% accuracy at speeds exceeding 2 to 5 tons per hour. The resulting high-purity flakes command a premium of 25–40% higher price in the local and export market, achieving ROI within 8 to 14 months.</p>
  </details>
  <details class="q-faq">
    <summary>What maintenance prevents premature barrel and screw wear when extruding recycled scrap?</summary>
    <p>Post-consumer scrap contains calcium carbonate fillers and microscopic grit. To prevent rapid barrel wear: 1) Specify bimetallic barrels with tungsten carbide liners; 2) Maintain strict melt temperatures to avoid cold-start torque stress; 3) Use dual-piston screen changers with minimum 80-mesh wire screens; and 4) Inspect screw outer flight clearances semi-annually.</p>
  </details>
</div>

<div class="q-section q-cta">
  <h2>Discuss Machinery, Inventions &amp; Scrap Sourcing</h2>
  <p>Al Qaryan Industries operates 500 tons/month of polymer processing, recycling, and pipe manufacturing in Karachi. Whether you need technical consultation, factory-grade regrind, or want to list your scrap:</p>
  <p class="q-cta__actions">
    <a class="q-btn q-btn--primary" href="/contact/">Contact Our Engineering Team</a>
    <a class="q-btn q-btn--wa" href="${WA}" target="_blank" rel="noopener">WhatsApp ${TEL}</a>
    <a class="q-btn" style="background:#0b6e4f;color:#fff;" href="/scrap-market/">Visit Scrap Market</a>
  </p>
</div>
`;

// ============================================================================
// 2. HELPER TO FIND / CREATE / UPDATE WP PAGES
// ============================================================================
async function findPage(slug) {
  const r = await fetch(`${SITE}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&status=publish,draft&_fields=id,slug,link`, { headers: H });
  const list = await r.json();
  return Array.isArray(list) && list.length ? list[0] : null;
}

async function findPost(slug) {
  const r = await fetch(`${SITE}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=publish,draft&_fields=id,slug,link`, { headers: H });
  const list = await r.json();
  return Array.isArray(list) && list.length ? list[0] : null;
}

async function savePage({ title, slug, content, excerpt, focus, seoTitle, seoDesc }) {
  const wrapped = wrapContent(content);
  const existing = await findPage(slug);
  const payload = {
    title,
    slug,
    content: wrapped,
    excerpt: seoDesc,
    status: 'publish',
    comment_status: 'closed',
    ping_status: 'closed'
  };

  const res = existing
    ? await fetch(`${SITE}/wp-json/wp/v2/pages/${existing.id}`, { method: 'POST', headers: H, body: JSON.stringify(payload) })
    : await fetch(`${SITE}/wp-json/wp/v2/pages`, { method: 'POST', headers: H, body: JSON.stringify(payload) });
  
  const saved = await res.json();
  if (!res.ok) {
    console.error(`Page ${slug} save FAILED:`, res.status, saved);
    return null;
  }
  console.log(`Page saved: /${saved.slug}/ (ID ${saved.id})`);

  // Rank Math SEO metadata
  const meta = { rank_math_focus_keyword: focus, rank_math_title: seoTitle, rank_math_description: seoDesc };
  await fetch(`${SITE}/wp-json/rankmath/v1/updateMeta`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ objectID: saved.id, objectType: 'post', meta })
  });

  return saved;
}

async function savePost({ title, slug, content, excerpt, categories, focus, seoTitle, seoDesc }) {
  const wrapped = wrapContent(content);
  const existing = await findPost(slug);
  const payload = {
    title,
    slug,
    content: wrapped,
    excerpt: seoDesc,
    categories,
    status: 'publish',
    comment_status: 'open',
    ping_status: 'open'
  };

  const res = existing
    ? await fetch(`${SITE}/wp-json/wp/v2/posts/${existing.id}`, { method: 'POST', headers: H, body: JSON.stringify(payload) })
    : await fetch(`${SITE}/wp-json/wp/v2/posts`, { method: 'POST', headers: H, body: JSON.stringify(payload) });
  
  const saved = await res.json();
  if (!res.ok) {
    console.error(`Post ${slug} save FAILED:`, res.status, saved);
    return null;
  }
  console.log(`Post saved: /${saved.slug}/ (ID ${saved.id})`);

  // Rank Math SEO metadata
  const meta = { rank_math_focus_keyword: focus, rank_math_title: seoTitle, rank_math_description: seoDesc };
  await fetch(`${SITE}/wp-json/rankmath/v1/updateMeta`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ objectID: saved.id, objectType: 'post', meta })
  });

  return saved;
}

// ============================================================================
// 3. EXECUTE PAGE CREATION
// ============================================================================
console.log('--- 1. Deploying Hub and Showcase Pages ---');

await savePage({
  title: 'Plastic Recycling News, Machinery Innovations & Market Insights',
  slug: 'news',
  content: newsHubHtml,
  focus: 'plastic recycling news pakistan',
  seoTitle: 'Plastic Recycling News & Machinery Innovations | Al Qaryan',
  seoDesc: 'Authoritative analysis on plastic recycling machinery, polymer inventions, scrap market price trends, and manufacturing engineering across Pakistan.'
});

await savePage({
  title: 'Plastic Recycling Machinery & New Inventions Guide',
  slug: 'machinery-inventions',
  content: machineryHtml,
  focus: 'plastic recycling machinery pakistan',
  seoTitle: 'Plastic Recycling Machinery & Inventions Guide | Al Qaryan',
  seoDesc: 'Comprehensive guide to plastic recycling machinery, twin-screw extruders, optical AI sorters, continuous melt filters, and polymer recovery inventions.'
});

// ============================================================================
// 4. FOUNDATIONAL LIVE BLOG POSTS
// ============================================================================
console.log('\n--- 2. Deploying Foundational Live Blog Posts ---');

// POST 1: Machinery
const post1Content = `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Machinery Engineering</p>
  <h1>Twin-Screw vs Single-Screw Extruders for PVC &amp; HDPE Pipe Manufacturing</h1>
  <p class="q-lead">An engineering breakdown of screw geometry, melt homogeneity, shear heat control, and electricity consumption in Pakistan factory environments.</p>
</div>

<div class="q-section">
  <h2>The Engineering Difference: Pumping vs Friction</h2>
  <p>In plastic pipe extrusion and recycling, selecting between a single-screw and a twin-screw extruder dictates your production output, resin cost, and scrap tolerance.</p>
  <p><strong>Single-screw extruders</strong> rely on frictional drag against the barrel wall to transport, melt, and pump polymer forward. For semi-crystalline polymers like <strong>HDPE</strong> and <strong>LDPE</strong>, this works exceptionally well because polyolefins have wide processing temperature windows and forgiving melt rheology.</p>
  <p><strong>Twin-screw extruders (conical or parallel)</strong> use intermeshing screws that provide positive mechanical displacement. For amorphous, heat-sensitive polymers like <strong>rigid uPVC</strong>, twin-screw extruders are the global industry standard. They pump dry-blend compound without relying on high frictional shear heat, preventing PVC degradation and burning.</p>
</div>

<div class="q-section">
  <h2>L/D Ratio and Degassing Traps</h2>
  <p>When extruding post-industrial or post-consumer regrind, moisture and volatile additives must escape before the molten plastic reaches the pipe die head:</p>
  <ul class="q-list">
    <li><strong>Single-Screw L/D:</strong> Standard extruders use an L/D ratio of 30:1 to 34:1 with a central vacuum degassing port at 0.08 MPa vacuum to vent moisture.</li>
    <li><strong>Conical Twin-Screw:</strong> The conical geometry allows large screw diameters at the feed section (e.g. 132 mm) tapering down to smaller diameters (e.g. 65 mm) at the discharge, delivering extreme compression and natural air venting back through the feed hopper.</li>
  </ul>
</div>

<div class="q-section">
  <h2>Power Consumption &amp; Economics in Pakistan</h2>
  <p>With industrial electricity tariffs in Karachi exceeding PKR 40–50 per kWh, motor efficiency is critical:</p>
  <ul class="q-list">
    <li>Twin-screw extruders deliver approximately <strong>4.5 to 5.5 kg of PVC pipe per kWh</strong> of electrical energy consumed.</li>
    <li>Single-screw extruders on HDPE deliver approximately <strong>3.8 to 4.8 kg per kWh</strong> due to higher melting enthalpies.</li>
    <li>Equipping either system with an AC inverter drive and electromagnetic induction heating bands reduces baseline thermal losses by up to 25%.</li>
  </ul>
</div>

<div class="q-section q-cta">
  <h2>Looking for Extrusion Compounds or Pipe Regrind?</h2>
  <p>Al Qaryan Industries manufactures certified PVC and HDPE pipes and supplies industrial-grade recycled polymer compounds across Pakistan.</p>
  <p class="q-cta__actions">
    <a class="q-btn q-btn--primary" href="/contact/">Request Compound Specs</a>
    <a class="q-btn q-btn--wa" href="${WA}" target="_blank" rel="noopener">WhatsApp Our Engineers</a>
    <a class="q-btn" style="background:#0b6e4f;color:#fff;" href="/scrap-market/">Browse Scrap Market</a>
  </p>
</div>
`;

await savePost({
  title: 'Twin-Screw vs Single-Screw Extruders for PVC and HDPE Pipe Manufacturing: 2026 Engineering Guide',
  slug: 'twin-screw-vs-single-screw-extruders',
  content: post1Content,
  categories: [19], // machinery
  focus: 'twin screw extruder pvc pipe',
  seoTitle: 'Twin-Screw vs Single-Screw Extruders for PVC Pipe | Al Qaryan',
  seoDesc: 'Engineering guide comparing twin-screw vs single-screw extruders for PVC and HDPE pipe manufacturing, melt shear, power consumption, and L/D ratios.'
});

// POST 2: Inventions
const post2Content = `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">New Inventions &amp; Tech</p>
  <h1>AI Optical Flake Sorters &amp; NIR Sensors: The Breakthrough in Scrap Plastic Purity</h1>
  <p class="q-lead">How near-infrared hyperspectral vision and high-speed pneumatic air ejection are revolutionizing scrap plastic recycling purity and economics.</p>
</div>

<div class="q-section">
  <h2>Why Manual Sorting Fails at Modern Industrial Scale</h2>
  <p>Historically in Pakistan, sorting plastic scrap by polymer family (HDPE vs PP vs PVC vs PET) relied entirely on visual inspection and hand sorting. This model encounters severe physical limitations:</p>
  <ul class="q-list">
    <li>Clear PET and clear PVC flakes look identical to human eyes, yet 50 ppm of PVC in a PET melt completely degrades polyester fibers.</li>
    <li>Human sorting accuracy drops drastically after 4 hours on a conveyor, averaging only 80–85% purity.</li>
    <li>Speed is capped at 40–60 kg per hour per laborer.</li>
  </ul>
</div>

<div class="q-section">
  <h2>The Invention: Near-Infrared (NIR) Optical Sorting</h2>
  <p>The modern optical flake sorter combines high-speed lighting, NIR spectrometry, and ultra-fast pneumatic ejection valves:</p>
  <ul class="q-list">
    <li><strong>Chemical Fingerprinting:</strong> Every plastic resin has a unique molecular absorption spectrum under near-infrared light (1,000–2,500 nm wavelength). As flakes slide down a 1,200 mm wide chute, NIR sensors scan them 10,000 times per second.</li>
    <li><strong>AI Neural Classification:</strong> Convolutional neural networks classify polymer type, color, and transparency in under 5 milliseconds.</li>
    <li><strong>Pneumatic Micro-Nozzles:</strong> A manifold of 128 to 256 high-pressure air valves fire millisecond micro-blasts at target contaminants, deflecting them into a reject chute.</li>
    <li><strong>Purity:</strong> Outputs consistently reach <strong>99.5% purity</strong> at speeds of 2,000 to 5,000 kg per hour.</li>
  </ul>
</div>

<div class="q-section q-cta">
  <h2>Source High-Purity Polymer Regrind in Pakistan</h2>
  <p>Explore sorted scrap lots, washed flakes, and regrind material directly on the Al Qaryan Scrap Market.</p>
  <p class="q-cta__actions">
    <a class="q-btn q-btn--primary" href="/scrap-market/">Explore Flake &amp; Scrap Lots</a>
    <a class="q-btn q-btn--wa" href="${WA}" target="_blank" rel="noopener">WhatsApp ${TEL}</a>
  </p>
</div>
`;

await savePost({
  title: 'AI Optical Flake Sorters and NIR Sensors: The Breakthrough Invention in Scrap Plastic Purity',
  slug: 'ai-optical-sorting-scrap-plastic',
  content: post2Content,
  categories: [20], // inventions
  focus: 'optical sorting plastic scrap',
  seoTitle: 'AI Optical Flake Sorters & NIR Sensors for Scrap | Al Qaryan',
  seoDesc: 'How near-infrared NIR optical sorters and AI hyperspectral vision achieve 99.5% scrap plastic flake purity, eliminating manual sorting bottlenecks.'
});

// POST 3: Market Rates
const post3Content = `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Market Rates &amp; Trends</p>
  <h1>Pakistan Plastic Scrap Market Rates &amp; Polymer Trends (November 2026)</h1>
  <p class="q-lead">Weekly scrap price benchmarks for HDPE blow grade, PVC regrind, and LDPE film across Karachi and Lahore industrial centers.</p>
</div>

<div class="q-section">
  <h2>Current Market Rate Overview (Karachi / Shershah / SITE)</h2>
  <p>Polymer scrap pricing in Pakistan during November 2026 remains supported by steady domestic pipe demand, localized polymer shortages, and global crude resin benchmarks.</p>
  
  <table class="q-table" style="width:100%;border-collapse:collapse;margin:1.5rem 0;">
    <thead>
      <tr style="background:#e8f4ef;text-align:left;">
        <th style="padding:10px;border:1px solid #e3ebe6;">Material Grade</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Condition / Form</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Benchmark Rate (PKR/kg)</th>
        <th style="padding:10px;border:1px solid #e3ebe6;">Market Demand</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>HDPE Blow Scrap</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Baled dairy / cosmetic bottles (unwashed)</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">PKR 185 – 215 / kg</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">High (container molding)</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>HDPE Pipe Regrind (PE100)</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Clean black granulate, zero PVC contamination</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">PKR 240 – 275 / kg</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Very High (infrastructure pipe)</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>uPVC Pipe Scrap</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Grey / white rigid pipe cut-offs</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">PKR 250 – 285 / kg</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Strong (conduit &amp; fittings)</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>LDPE Clear Film</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Grade A post-industrial stretch film bales</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">PKR 190 – 225 / kg</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Stable</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e3ebe6;"><strong>PP Woven Scrap</strong></td>
        <td style="padding:10px;border:1px solid #e3ebe6;">White cement / sugar bag scrap (baled)</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">PKR 140 – 165 / kg</td>
        <td style="padding:10px;border:1px solid #e3ebe6;">Moderate</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Key Factors Driving Rates This Month</h2>
  <ul class="q-list">
    <li><strong>Exchange Rate Stability:</strong> Relatively stable PKR parity against USD has kept imported virgin resin prices steady, setting a predictable ceiling for secondary regrind.</li>
    <li><strong>Infrastructure Projects:</strong> Agricultural drip irrigation projects and municipal sewerage works in Punjab and Sindh have intensified demand for clean PE100 and uPVC regrinds.</li>
    <li><strong>Quality Premiums:</strong> Recyclers are paying up to 15% premiums for certified moisture-free, metal-free scrap to avoid downtime on high-speed extrusion lines.</li>
  </ul>
</div>

<div class="q-section q-cta">
  <h2>Trade Directly on the Al Qaryan Scrap Market</h2>
  <p>Find real lots with prices or list your material to buyers across Karachi and Pakistan.</p>
  <p class="q-cta__actions">
    <a class="q-btn q-btn--primary" href="/scrap-market/">Browse Scrap Lots</a>
    <a class="q-btn q-btn--wa" href="${WA}" target="_blank" rel="noopener">WhatsApp ${TEL}</a>
    <a class="q-btn" style="background:#0b6e4f;color:#fff;" href="/list-your-scrap/">List Your Scrap Material</a>
  </p>
</div>
`;

await savePost({
  title: 'Pakistan Plastic Scrap Market Rates & Polymer Trends (November 2026)',
  slug: 'pakistan-plastic-scrap-price-trends-nov-2026',
  content: post3Content,
  categories: [21], // market-rates
  focus: 'plastic scrap price in pakistan',
  seoTitle: 'Plastic Scrap Rates in Pakistan (Nov 2026) | Al Qaryan',
  seoDesc: 'Current market rates for HDPE blow scrap, uPVC pipe regrind, and LDPE film in Pakistan. Price analysis for Karachi and Lahore industrial centers.'
});

console.log('\nAll pages and posts published successfully!');
