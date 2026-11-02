// Entry point for the "Materials We Deal" section: hub page + 13 material pages.
import { CTA } from './constants.mjs';
import { renderMaterial } from './template.mjs';
import { PIPE_SCRAP } from './data-pipes.mjs';
import { CONTAINER_SCRAP } from './data-containers.mjs';
import { OTHER_SCRAP } from './data-other.mjs';

export const HUB_ID = 1040;

const MATERIALS = PIPE_SCRAP.concat(CONTAINER_SCRAP, OTHER_SCRAP);

// Cards on the hub page, in the order the client asked for.
const CARD_ORDER = [
  ['hdpe-100-pipe-scrap', 'HDPE 100 pipe scrap', 'Pressure pipe scrap from water, gas and telecom networks — the highest grade of PE pipe scrap we handle.'],
  ['hdpe-80-scrap', 'HDPE 80 scrap', 'PE80 pipe recovered from older water and irrigation mains.'],
  ['hdpe-60-scrap', 'HDPE 60 scrap', 'Legacy PE63 pipe from the oldest decommissioned supply lines.'],
  ['pvc-pipe-scrap', 'PVC pipe scrap', 'Rigid uPVC drainage, sewer and conduit pipe for regrind and compound.'],
  ['pvc-cable-scrap', 'PVC cable scrap', 'Insulation and sheathing PVC recovered from wire and cable waste.'],
  ['upvc-profile-scrap', 'UPVC profile scrap', 'Window and door profile scrap with glass, steel and gaskets removed.'],
  ['pet-bottle-scrap', 'PET bottle scrap', 'Baled bottles and washed flake for fibre, sheet and strapping producers.'],
  ['pc-bottle-scrap', 'PC bottle scrap', 'Polycarbonate water bottles recycled into engineering applications.'],
  ['hdpe-jerry-can-scrap', 'HDPE jerry can scrap', 'Blow-moulded containers from oil, chemical, detergent and food use.'],
  ['hdpe-cable-cover-scrap', 'HDPE cable cover scrap', 'Cable protection covers, split duct and conduit recovered from utility work.'],
  ['pp-scrap', 'PP scrap', 'Woven sacks, FIBC, crates, caps and containers in polypropylene.'],
  ['prime-materials', 'Prime materials', 'Virgin polymer with a full producer specification and certificate of analysis.'],
  ['off-grade-materials', 'Off-grade materials', 'Wide-spec and off-spec polymer in bulk for cost-sensitive applications.']
];

const cards = CARD_ORDER.map(function (c) {
  return '  <div class="q-card"><h3>' + c[1] + '</h3><p>' + c[2] + '</p><a class="q-link" href="/materials-we-deal/' + c[0] + '/">' + c[1] + '</a></div>';
}).join('\n');

const HUB = {
  id: HUB_ID,
  slug: 'materials-we-deal',
  title: 'Materials We Deal',
  wpTitle: 'Plastic Materials We Deal',
  seoTitle: 'Materials We Deal — Plastic Scrap and Polymer Grades | Al Qaryan Industries',
  seoDesc: 'The plastic materials Al Qaryan Industries buys, recycles and sells in Pakistan: HDPE, PVC, PET, PC and PP scrap plus prime and off-grade polymer grades.',
  focus: 'plastic materials we deal',
  html: `<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials we deal</p>
  <h1>Materials we deal</h1>
  <p class="q-lead">Thirteen material streams, bought, recycled and sold from our Karachi facility. Each one has its own page covering what the material is, the grades we handle, the specification we work to, the contamination that matters, how we collect and recycle it, and what it becomes. If you buy plastic scrap or sell it, start here and go straight to the stream that concerns you.</p>
</div>

<div class="q-section">
  <h2>Two ways to use this section</h2>
  <p>Al Qaryan Industries sits in the middle of the plastic chain, which means we are both a buyer and a seller. If you generate scrap — a factory, a contractor, a utility, a demolition firm, a collector — go to the page for your material and look at the grades and the collection section. If you consume material — a pipe maker, a moulder, a compounder, a fibre producer — the same page tells you the form we supply, the specification we can hold and the documentation that comes with the load.</p>
  <p>Each page is written around what actually decides a price: the grade, the contamination profile and the form. Plastic is not a commodity that can be bought from a list, because two loads described with the same three words can be worth very different amounts. Understanding that is the difference between a good purchase and an expensive lesson.</p>
  <p>If you are looking for polymers grouped by resin family instead — HDPE, LDPE, PP, PET, PVC and ABS/PS — the <a href="/materials/">materials overview</a> covers the six families we supply as regrind, flake and pellets. This section goes the other way: by the specific scrap stream and trading grade, with the detail that decides whether a load is worth buying.</p>
</div>

<div class="q-section">
  <h2>Scrap materials</h2>
  <div class="q-grid q-grid--3">
${cards}
  </div>
</div>

<div class="q-section">
  <h2>How the thirteen streams divide up</h2>
  <p>The first group is pipe and profile scrap: <a href="/materials-we-deal/hdpe-100-pipe-scrap/">HDPE 100</a>, <a href="/materials-we-deal/hdpe-80-scrap/">HDPE 80</a> and <a href="/materials-we-deal/hdpe-60-scrap/">HDPE 60</a> pipe, plus <a href="/materials-we-deal/pvc-pipe-scrap/">PVC pipe scrap</a> and <a href="/materials-we-deal/upvc-profile-scrap/">UPVC profile scrap</a>. These are heavy, well-identified, single-polymer streams recovered from infrastructure and construction work. They are the easiest materials to recycle well and they respond to clean grading with a real price premium.</p>
  <p>The second group is bottle, container and utility scrap: <a href="/materials-we-deal/pet-bottle-scrap/">PET bottle scrap</a>, <a href="/materials-we-deal/pc-bottle-scrap/">PC bottle scrap</a>, <a href="/materials-we-deal/hdpe-jerry-can-scrap/">HDPE jerry can scrap</a> and <a href="/materials-we-deal/hdpe-cable-cover-scrap/">HDPE cable cover scrap</a>. These are lighter per unit volume and they arrive through collection networks rather than directly from a single site, so contamination and sorting decide the value.</p>
  <p>The third group is <a href="/materials-we-deal/pvc-cable-scrap/">PVC cable scrap</a> and <a href="/materials-we-deal/pp-scrap/">PP scrap</a> — high-volume industrial streams where the plastic is a by-product of another recovery process, such as copper stripping or packaging waste.</p>
  <p>And the fourth group is the trading grades: <a href="/materials-we-deal/prime-materials/">prime materials</a> with a full producer specification, and <a href="/materials-we-deal/off-grade-materials/">off-grade materials</a> for cost-sensitive applications. These are not scrap at all; they are the material a manufacturer buys when recycled content will not do.</p>
</div>

<div class="q-section">
  <h2>What every page tells you</h2>
  <ul class="q-list">
    <li>What the material is, and which classification it falls under</li>
    <li>The grades we buy and sell, and why the grades are separated</li>
    <li>The specification we work to, with the properties we measure and report</li>
    <li>The contaminants that decide whether a load is good or merely big</li>
    <li>How we collect it, and what makes a load worth more at the gate</li>
    <li>How we process it, and the honest limits of what recycled material can do</li>
    <li>What the recycled material becomes in the Pakistani market</li>
  </ul>
  <p class="q-note">Where a figure depends on the lot — melt flow, intrinsic viscosity, filler content — we say so and confirm it on the batch report rather than publishing a number we cannot hold to.</p>
</div>

${CTA}`,
  parent: null
};

// Short WordPress page titles. Rank Math appends " - <site name>" to the post title
// for pages without a Rank Math override, so these are kept to ~30 characters and the
// longer seoTitle is retained only as a reference for the full search snippet.
const WP_TITLES = {
  'materials-we-deal': 'Plastic Materials We Deal',
  'hdpe-100-pipe-scrap': 'HDPE 100 Pipe Scrap — Grades',
  'hdpe-80-scrap': 'HDPE 80 Scrap — Grades & Uses',
  'hdpe-60-scrap': 'HDPE 60 Scrap (PE63) Grades',
  'pvc-pipe-scrap': 'PVC Pipe Scrap — Grades & Uses',
  'upvc-profile-scrap': 'UPVC Profile Scrap — Grades',
  'pet-bottle-scrap': 'PET Bottle Scrap — Bales & Flake',
  'pc-bottle-scrap': 'PC Bottle Scrap — PC Regrind',
  'hdpe-jerry-can-scrap': 'HDPE Jerry Can Scrap — Regrind',
  'hdpe-cable-cover-scrap': 'HDPE Cable Cover Scrap',
  'pvc-cable-scrap': 'PVC Cable Scrap — Compound',
  'pp-scrap': 'PP Scrap — Sacks, Crates, Caps',
  'prime-materials': 'Prime Plastic Materials',
  'off-grade-materials': 'Off-Grade Plastic Materials'
};

export const MATERIAL_DEAL_PAGES = [HUB].concat(
  MATERIALS.map(function (m) {
    return {
      id: m.id,
      slug: 'materials-we-deal/' + m.slug,
      title: m.title,
      wpTitle: WP_TITLES[m.slug] || m.title,
      parent: HUB_ID,
      seoTitle: m.title + ' — Buying, Grades and Recycling | Al Qaryan Industries',
      seoDesc: m.seoDesc || m.lede.slice(0, 156),
      focus: m.focus,
      html: renderMaterial(m)
    };
  })
);

export { MATERIALS };
