// Two buyer-guide pages that target the "best / new / supplier / manufacturer" searches for
// PVC and HDPE 100 pipe in Pakistan.
//
// Rules followed here:
//  * every technical figure is a published standard value (ISO 4427, ISO 1452, ASTM D1785,
//    DIN 8074/8075), not an invention;
//  * no unverifiable superlatives ("No.1", "cheapest", "#1 in Pakistan"). The words "best" and
//    "supplier" appear in headings where they describe a buyer's question, not a claim about us;
//  * no size, SDR or PN range is stated for Al Qaryan until the factory confirms it — the pages
//    invite the buyer to send their requirement instead;
//  * certifications and capacity are the ones the owner confirmed: ISO 9001, ISO 14001, PSQCA,
//    500 tons per month of each pipe family with headroom above that.

const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function renderSection(s) {
  const out = ['<div class="q-section">', '  <h2>' + s.h2 + '</h2>'];
  (s.paras || []).forEach(p => out.push('  <p>' + p + '</p>'));
  if (s.list) {
    out.push('  <ul class="q-list">');
    s.list.forEach(li => out.push('    <li>' + li + '</li>'));
    out.push('  </ul>');
  }
  if (s.table) {
    out.push('  <table class="q-table">', '    <tbody>');
    s.table.forEach(row => out.push('      <tr><th>' + row[0] + '</th><td>' + row[1] + '</td></tr>'));
    out.push('    </tbody>', '  </table>');
  }
  if (s.note) out.push('  <p class="q-note">' + s.note + '</p>');
  out.push('</div>');
  return out.join('\n');
}

const CTA = `<div class="q-section q-cta">
  <h2>Send your pipe requirement</h2>
  <p>Give us the diameter, the pressure class you need, the quantity and the delivery location. We confirm what we can supply, the price per metre and the lead time — in writing, before you commit.</p>
  <p><a class="q-link" href="/contact/">Contact Al Qaryan Industries</a> · <a class="q-link" href="tel:+923332010506">+92 333 201506</a></p>
</div>`;

function render(p) {
  const chips = (p.chips || []).map(c => '<span class="q-chip">' + c + '</span>').join('');
  const faqs = p.faqs.map(f => '<details class="q-faq"><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>').join('\n  ');
  const related = p.related.map(r => '<div class="q-card"><h3>' + r[0] + '</h3><p>' + r[1] + '</p><a class="q-link" href="' + r[2] + '">' + r[0] + '</a></div>').join('\n  ');

  return `<div class="q-hero q-hero--compact">
  <p class="q-kicker">${p.kicker}</p>
  <h1>${p.h1}</h1>
  <p class="q-lead">${p.lede}</p>
  <div class="q-chips">${chips}</div>
</div>

${p.sections.map(renderSection).join('\n\n')}

<div class="q-section">
  <h2>Questions buyers ask before ordering</h2>
  ${faqs}
</div>

<div class="q-section">
  <h2>Related pages</h2>
  <div class="q-grid q-grid--3">
  ${related}
  </div>
</div>

${CTA}

<script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'Product', name: p.h1, category: p.category,
    material: p.schemaMaterial, brand: { '@type': 'Brand', name: 'Al Qaryan Industries' },
    description: p.seoDesc,
    offers: {
      '@type': 'Offer', availability: 'https://schema.org/InStock',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      areaServed: { '@type': 'Country', name: 'Pakistan' },
      seller: { '@type': 'Organization', '@id': 'https://alqaryangroup.com/#organization', name: 'Al Qaryan Industries LLC', url: 'https://alqaryangroup.com/' }
    }
  })}
</script>

<script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://alqaryangroup.com/' },
      { '@type': 'ListItem', position: 2, name: p.h1, item: 'https://alqaryangroup.com/' + p.slug + '/' }
    ]
  })}
</script>

<script type="application/ld+json">
${jsonLd({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: p.faqs.map(f => ({
      '@type': 'Question', name: f[0].replace(/<[^>]*>/g, ''),
      acceptedAnswer: { '@type': 'Answer', text: f[1].replace(/<[^>]*>/g, '') }
    }))
  })}
</script>`;
}

// ---------------------------------------------------------------------------
export const HDPE = {
  slug: 'hdpe-pipes-pakistan',
  kicker: 'PIPES WE MANUFACTURE · HDPE 100 (PE100)',
  h1: 'HDPE 100 Pipes in Pakistan — Manufacturer, PE100 Grades and SDR Guide',
  lede: 'Al Qaryan Industries manufactures HDPE 100 (PE100) pipe in Karachi and supplies 500 tons per month, with capacity above that. This page explains what PE100 means, which SDR gives which pressure rating, and how to check any HDPE pipe supplier before you order.',
  seoTitle: 'HDPE 100 Pipes in Pakistan | PE100 Manufacturer & Supplier',
  seoDesc: 'HDPE 100 pipes in Pakistan made in Karachi — 500 tons per month, ISO 9001 and PSQCA licensed. PE100 grades, SDR to PN ratings, supplier checklist.',
  focus: 'hdpe 100 pipes in pakistan',
  category: 'HDPE (PE100) pressure pipe',
  schemaMaterial: 'Polyethylene PE100',
  chips: ['PE100 / PE100-RC', '500 tons / month', 'PSQCA licensed', 'ISO 9001 & 14001', 'Karachi, since 2007'],
  sections: [
    {
      h2: 'What HDPE 100 pipe is, precisely',
      paras: [
        'HDPE 100 — normally written <strong>PE100</strong> — is a grade of high-density polyethylene classified by its minimum required strength. PE100 must survive a hoop stress of <strong>10.0 MPa for 50 years at 20 °C</strong>. That single number separates it from PE80 (8.0 MPa) and PE63 (6.3 MPa), and it is why PE100 pipe can carry the same pressure through a thinner wall, or more pressure through the same wall.',
        '"HDPE 100 pipes" and "PE100 pipes" mean the same product. The 100 is not a diameter, a pressure rating or a score out of 100 — it is the resin class. A pipe described as "HDPE 100" without a stated SDR or PN tells you almost nothing about what it can carry.',
        'PE100-RC is the same base grade with enhanced resistance to slow crack growth, specified where pipe will be handled roughly, installed by trenchless methods, or laid in rocky ground.'
      ]
    },
    {
      h2: 'We manufacture and supply 500 tons of HDPE pipe per month',
      paras: [
        'Al Qaryan Industries LLC extrudes HDPE (PE100) pipe at our own plant in the Shershah Industrial Area, Karachi. Current output and supply is <strong>500 tons per month</strong>, and the plant has capacity beyond that for larger programmes and repeat monthly offtake.',
        'Because the pipe line sits next to our recycling division, the polymer feeding it is under our own control rather than bought on the open market and taken on trust. That is also why we can buy back HDPE 100 pipe scrap and offcuts from fabricators and contractors — the material comes back into the same loop.'
      ],
      list: [
        '<strong>Manufacturer, not a reseller</strong> — the pipe is extruded in our plant, so the resin, wall thickness and fusion advice are ours to stand behind.',
        '<strong>500 tons per month</strong> of HDPE pipe, with room to scale for scheduled monthly supply.',
        '<strong>ISO 9001 and ISO 14001</strong> certified plant; pipe production is PSQCA licensed.',
        '<strong>Nationwide delivery</strong> across Pakistan, with freight and lead time confirmed in the quotation.'
      ]
    },
    {
      h2: 'PE100 compared with PE80 and PE63',
      paras: ['The difference matters most when you compare two quotes for the "same" pipe — one may be a lower grade with thicker walls, which is heavier, harder to fuse and not automatically equivalent.'],
      table: [
        ['Resin class', 'Minimum required strength (MRS)'],
        ['PE100', '10.0 MPa — 50 years at 20 °C'],
        ['PE80', '8.0 MPa — 50 years at 20 °C'],
        ['PE63', '6.3 MPa — 50 years at 20 °C'],
        ['PE100-RC', 'PE100 base, enhanced slow-crack-growth resistance']
      ],
      note: 'Always ask for the resin grade on the mill certificate. The class cannot be identified by looking at the pipe.'
    },
    {
      h2: 'SDR and pressure rating: the table buyers actually need',
      paras: ['SDR is the standard dimension ratio: outside diameter divided by wall thickness. A lower SDR means a thicker wall and a higher pressure rating. For PE100 water pipe the relationship is fixed by the standard:'],
      table: [
        ['SDR 26', 'PN 6'],
        ['SDR 21', 'PN 8'],
        ['SDR 17', 'PN 10'],
        ['SDR 13.6', 'PN 12.5'],
        ['SDR 11', 'PN 16'],
        ['SDR 9', 'PN 20'],
        ['SDR 7.4', 'PN 25']
      ],
      note: 'PN figures assume water at 20 °C. Above 20 °C the allowable pressure falls, so hot-climate or deeply buried lines need the derating factors from the standard, not the headline PN.'
    },
    {
      h2: 'What projects in Pakistan use PE100 pipe',
      list: [
        'Potable water mains and distribution networks — the default choice for new rural and municipal supply lines.',
        'Agricultural irrigation: tube wells, sprinkler and drip mainlines, where long coil lengths reduce joint count.',
        'Borehole and pump rising mains.',
        'Industrial fluid transfer — chemical effluent, slurry and cooling water, where PVC would become brittle.',
        'Telecom and power ducting.',
        'Sewer and storm outfalls, usually at lower SDR classes.'
      ],
      paras: ['Gas distribution uses a separate standard (ISO 4437) with stricter material requirements. A water-grade PE100 pipe is not automatically acceptable for gas, and no supplier should imply that it is.']
    },
    {
      h2: 'The standards behind an HDPE 100 pipe order',
      table: [
        ['ISO 4427', 'Plastics piping systems for water supply — polyethylene. The reference for PE water pipe dimensions and performance.'],
        ['DIN 8074', 'Dimensions of PE pipes.'],
        ['DIN 8075', 'General quality requirements and testing for PE pipes.'],
        ['PSQCA', 'Pakistan Standards and Quality Control Authority — the licence a pipe sold in Pakistan is expected to carry.'],
        ['ISO 9001 / 14001', 'Quality and environmental management at the plant — a factory certification, not a product certification.']
      ],
      note: 'A colour stripe or a datasheet alone proves nothing. Ask for the batch test report and the resin certificate, and check that the wall thickness matches the SDR you ordered.'
    },
    {
      h2: 'How to tell the best HDPE pipe supplier from the rest',
      paras: ['The word "best" is used freely by every supplier in Pakistan, including us, so it is worth nothing on its own. These are the five things that separate a supplier who will still answer the phone in year three from one who will not:'],
      list: [
        '<strong>The resin grade is stated in writing</strong>, with the mill certificate — PE100, PE100-RC or nothing.',
        '<strong>The SDR and wall thickness are stated per size</strong>, not just a PN number, so you can verify with a calliper on delivery.',
        '<strong>Licence and test reports exist</strong> — PSQCA for the product, ISO 9001/14001 for the plant.',
        '<strong>Fusion support is offered</strong>: PE100 is only as good as its joints. A supplier who cannot advise on butt-fusion parameters is selling you a liability.',
        '<strong>Traceability is real</strong>: batch marking on the pipe that matches the certificate handed over with it.'
      ]
    }
  ],
  faqs: [
    ['Do you manufacture HDPE 100 pipe or only trade it?', 'We manufacture it. Al Qaryan Industries extrudes HDPE (PE100) pipe at our own plant in the Shershah Industrial Area, Karachi, and supplies 500 tons per month with capacity above that.'],
    ['How much HDPE pipe can you supply each month?', '500 tons per month is our current output and supply level, and the plant can go beyond that for scheduled programmes. Tell us your monthly requirement and we will confirm capacity and lead time in writing.'],
    ['What does PE100 mean in HDPE pipe?', 'PE100 is the resin class: the pipe must withstand 10.0 MPa hoop stress for 50 years at 20 °C. It is a material classification, not a pressure rating. The pressure capability comes from the SDR — SDR 17 in PE100 gives PN 10, SDR 11 gives PN 16.'],
    ['Is HDPE 100 the same as PE100?', 'Yes. "HDPE 100", "HDPE100" and "PE100" all describe the same polyethylene grade. The 100 refers to the MRS class, not a diameter or a score.'],
    ['Which SDR do I need for PN 16?', 'SDR 11. The standard pairs are SDR 26 / PN 6, SDR 21 / PN 8, SDR 17 / PN 10, SDR 13.6 / PN 12.5, SDR 11 / PN 16, SDR 9 / PN 20 and SDR 7.4 / PN 25 — all at 20 °C for water.'],
    ['Can PE100 pipe be used for drinking water?', 'Yes, PE100 is widely used for potable water. Confirm the grade meets the potable-water requirements of the standard you are specifying and ask for the resin certificate, because not every PE100 compound is approved for contact with drinking water.'],
    ['What is the difference between PE100 and PE100-RC?', 'PE100-RC is PE100 with much greater resistance to slow crack growth. It is specified for trenchless installation, rocky backfill or rough handling, because it tolerates the surface scratches that would shorten the life of standard PE100.'],
    ['Do you supply HDPE pipe outside Karachi?', 'Yes — we deliver across Pakistan. Send the delivery location with your enquiry and we will confirm freight and lead time along with the price.']
  ],
  related: [
    ['PVC Pipes in Pakistan', 'uPVC pipe types, pressure classes and the same 500 tons per month capacity.', '/pvc-pipes-pakistan/'],
    ['HDPE 100 Pipe Scrap', 'Grades, sources and buying specification for PE100 pipe scrap.', '/materials-we-deal/hdpe-100-pipe-scrap/'],
    ['HDPE 80 & 60 Pipe Scrap', 'Lower-grade PE pipe scrap for non-pressure applications.', '/materials-we-deal/hdpe-80-scrap/'],
    ['Materials We Deal', 'Every polymer grade we buy and supply.', '/materials-we-deal/']
  ]
};

export const PVC = {
  slug: 'pvc-pipes-pakistan',
  kicker: 'PIPES WE MANUFACTURE · PVC / uPVC',
  h1: 'PVC Pipes in Pakistan — uPVC Manufacturer, Pressure Classes and Buying Guide',
  lede: 'Al Qaryan Industries manufactures uPVC pipe in Karachi and supplies 500 tons per month, with capacity above that. This page covers which uPVC pipe you actually need, what PN and Schedule mean, and how to check a manufacturer\'s claims before you buy.',
  seoTitle: 'PVC Pipes in Pakistan | uPVC Manufacturer & Supplier',
  seoDesc: 'PVC pipes in Pakistan made in Karachi — 500 tons per month, ISO 9001 and PSQCA licensed. uPVC pressure classes, Schedule 40 and 80, supplier checklist.',
  focus: 'pvc pipes in pakistan',
  category: 'uPVC pressure and drainage pipe',
  schemaMaterial: 'Unplasticised polyvinyl chloride (PVC-U)',
  chips: ['Pressure & SWR', '500 tons / month', 'PSQCA licensed', 'ISO 9001 & 14001', 'Two extrusion lines'],
  sections: [
    {
      h2: 'What uPVC pipe is, and what it is not',
      paras: [
        'uPVC — unplasticised polyvinyl chloride, written PVC-U in the standards — is rigid PVC with no plasticiser added. That is what makes it stiff, dimensionally stable and suitable for pressurised water lines. The "u" is not a brand or a grade; it distinguishes it from plasticised PVC, which is flexible and used for hoses and cable insulation.',
        'It is not the same material as CPVC (chlorinated PVC, used for hot water) or PPR (polypropylene random copolymer, used for hot-water plumbing). A PVC pipe is a cold-water and drainage product; specifying it for hot water is a common and expensive mistake.'
      ]
    },
    {
      h2: 'We manufacture and supply 500 tons of PVC pipe per month',
      paras: [
        'Al Qaryan Industries LLC runs PVC pipe extrusion lines at our own plant in the Shershah Industrial Area, Karachi. Current output and supply is <strong>500 tons per month</strong>, and the plant has capacity beyond that for larger programmes and repeat monthly offtake.',
        'The extrusion lines sit alongside our plastic recycling division, so the compound going into the pipe is produced and controlled in-house rather than bought on the open market and taken on trust. We also buy PVC pipe scrap and offcuts back from fabricators and contractors.',
        'Between the two pipe families — PVC and HDPE — we manufacture and supply 500 tons per month of each, so a buyer sourcing both from us deals with one plant and one delivery schedule instead of two.'
      ],
      list: [
        '<strong>Manufacturer, not a reseller</strong> — pipe is extruded in our plant, so formulation, wall thickness and jointing advice are ours to stand behind.',
        '<strong>500 tons per month</strong> of PVC pipe, with room to scale for scheduled monthly supply.',
        '<strong>ISO 9001 and ISO 14001</strong> certified plant; pipe production is PSQCA licensed.',
        '<strong>Nationwide delivery</strong> across Pakistan, with freight and lead time confirmed in the quotation.'
      ]
    },
    {
      h2: 'The main types of PVC pipe sold in Pakistan',
      table: [
        ['uPVC pressure pipe', 'Potable water mains and distribution, irrigation, pump lines. Rated by PN class or Schedule.'],
        ['uPVC SWR pipe', 'Soil, waste and rain drainage inside and outside buildings. Not a pressure product.'],
        ['uPVC conduit', 'Electrical and telecom ducting — protects cable, carries no fluid.'],
        ['uPVC casing / screen', 'Borehole casing and well screens.'],
        ['Ribbed / corrugated PVC', 'Lightweight drainage and sewer applications.']
      ],
      note: 'Mixing these up is the most common buying error: SWR pipe used on a pumped line will fail, because it was never designed for internal pressure.'
    },
    {
      h2: 'Pressure classes, Schedule 40 and Schedule 80',
      paras: [
        'Two rating systems are in circulation in Pakistan and they are not interchangeable, so a quote must say which one it uses.',
        'The metric system rates pipe by <strong>PN</strong> — nominal pressure in bar at 20 °C: PN 4, PN 6, PN 10 and PN 16 are the common classes for uPVC water pipe. The inch system rates by <strong>Schedule</strong>: Schedule 40 and Schedule 80 have defined wall thicknesses for each nominal size, with Schedule 80 walls thicker and rated higher.'
      ],
      table: [
        ['ISO 1452', 'PVC-U piping systems for water supply and for buried drainage and sewerage under pressure — the international reference.'],
        ['ASTM D1785', 'PVC Schedule 40, 80 and 120 pipe.'],
        ['ASTM D2241', 'PVC pressure-rated pipe by SDR.'],
        ['BS 3505', 'Older British standard for uPVC pressure pipe, still cited in some Pakistani specifications.'],
        ['PSQCA', 'The licence a pipe sold in Pakistan is expected to carry.']
      ],
      note: 'If a tender says "Schedule 40" and a supplier quotes PN 10, ask for the wall thickness in millimetres for each size and compare. The two ratings do not align across all diameters.'
    },
    {
      h2: 'How to judge whether PVC pipe is actually good',
      paras: ['Colour and shine tell you nothing — pigment is cheap. These decide whether a pipe survives:'],
      list: [
        '<strong>Wall thickness against the standard</strong> for that size and class. Measure it. This is where substitution happens most often.',
        '<strong>Batch marking</strong> on the pipe: size, class, standard and manufacturer. Unmarked pipe cannot be traced or warranted.',
        '<strong>Opacity</strong> — uPVC for potable water should not be translucent. Light passing through encourages algae growth inside the pipe.',
        '<strong>Impact behaviour</strong> — a quality uPVC pipe deforms rather than shattering when struck. Brittle pipe usually means wrong filler loading or poor fusion in the extruder.',
        '<strong>Solvent cement compatibility</strong> — the joint is the weakest point. If the manufacturer cannot advise on cement and cure time for their own pipe, the joint is your problem.',
        '<strong>Certificate of conformity and PSQCA licence</strong> for the product you actually receive, not a generic brochure.'
      ]
    },
    {
      h2: 'How to tell the best PVC pipe from the rest',
      paras: ['Every manufacturer, us included, would like to be called the best PVC pipe manufacturer in Pakistan. Since that word is not measurable, judge on what can be measured:'],
      list: [
        'Wall thickness verified on a sample from the actual delivery, not from a display piece.',
        'A PSQCA licence number you can check, matching the product type.',
        'A plant ISO 9001 certificate, which means thickness and formulation were controlled — not merely inspected at the end.',
        'Test reports for the specific batch, especially where a tender requires them.',
        'A named person who answers after the invoice is paid.'
      ]
    },
    {
      h2: 'Where PVC pipe is used in Pakistan',
      list: [
        'Municipal and rural drinking-water distribution at PN 6 to PN 16.',
        'Building plumbing risers and cold-water lines.',
        'Soil, waste and rainwater drainage in commercial and residential construction.',
        'Agricultural irrigation mainlines and hydrant systems.',
        'Electrical and telecom ducting for new housing and industrial estates.',
        'Borehole casing in shallow and medium-depth wells.'
      ]
    }
  ],
  faqs: [
    ['Do you manufacture PVC pipe or only trade it?', 'We manufacture it. Al Qaryan Industries runs PVC pipe extrusion lines at our own plant in the Shershah Industrial Area, Karachi, and supplies 500 tons per month with capacity above that.'],
    ['How much PVC pipe can you supply each month?', '500 tons per month is our current output and supply level for PVC pipe, and the plant can go beyond that for scheduled programmes. Tell us your monthly requirement and we will confirm capacity and lead time in writing.'],
    ['Do you supply both PVC and HDPE pipe?', 'Yes. We manufacture and supply 500 tons per month of each — uPVC and HDPE (PE100) — from the same Karachi plant, so a project needing both is one supplier, one delivery schedule and one point of contact.'],
    ['What is the difference between PVC and uPVC pipe?', 'uPVC is unplasticised PVC — rigid PVC with no plasticiser, which is what makes it suitable for pressure pipe. When people say "PVC pipe" for water or drainage in Pakistan they almost always mean uPVC. Flexible plasticised PVC is a different product used for hoses and cable sheathing.'],
    ['What does PN 10 mean on a PVC pipe?', 'PN 10 means the pipe is rated for a nominal pressure of 10 bar at 20 °C. The rating is derived from wall thickness and diameter, so a PN number without a wall thickness cannot be verified on delivery.'],
    ['Is Schedule 40 the same as PN 10?', 'Not necessarily. Schedule 40 and PN are two different rating systems and their wall thicknesses do not align across every diameter. If a specification says Schedule 40, ask for the wall thickness in millimetres per size and compare it with what is delivered.'],
    ['Can uPVC pipe be used for hot water?', 'No. uPVC softens and loses strength as temperature rises. Hot-water lines need CPVC, PPR or a metal system. Using uPVC on hot water is one of the most common causes of premature pipe failure.'],
    ['Can PVC pipe be used underground?', 'Yes — uPVC is widely used for buried water mains and drainage. It needs proper bedding and backfill, and where heavy traffic loads are expected the correct pipe class and surround must be used.'],
    ['Do you supply PVC pipe outside Karachi?', 'Yes, we deliver across Pakistan. Send your delivery location with the enquiry and we will quote freight and lead time with the pipe price.']
  ],
  related: [
    ['HDPE 100 Pipes in Pakistan', 'PE100 grades, SDR to PN conversion and the same 500 tons per month capacity.', '/hdpe-pipes-pakistan/'],
    ['PVC Pipe Scrap', 'Grades and buying specification for PVC pipe scrap.', '/materials-we-deal/pvc-pipe-scrap/'],
    ['UPVC Profile Scrap', 'Window and profile scrap grades we buy.', '/materials-we-deal/upvc-profile-scrap/'],
    ['Materials We Deal', 'Every polymer grade we buy and supply.', '/materials-we-deal/']
  ]
};

// ---------------------------------------------------------------------------
// Pillar pages for the two head terms "HDPE scrap in Pakistan" and "LDPE scrap in Pakistan".
//
// These are deliberately different from the existing /materials/hdpe/ and /materials/ldpe/
// pages: those describe the polymer, these describe the TRANSACTION — which grades we buy,
// what moves the price per kg, how a load is inspected and paid, and what we supply back.
// They also link down to the specific grade pages, so the site has one pillar and many
// children instead of six pages fighting over the same phrase.

export const HDPE_SCRAP = {
  slug: 'hdpe-scrap-pakistan',
  kicker: 'WE BUY AND SUPPLY · HDPE SCRAP',
  h1: 'HDPE Scrap in Pakistan — Grades We Buy, Prices and How It Works',
  lede: 'Which HDPE scrap grades are worth money in Pakistan, what decides the price per kilogram, how a load is inspected and paid, and how to sell to us or buy recycled HDPE regrind and pellets back.',
  seoTitle: 'HDPE Scrap in Pakistan | Buyers, Grades & Prices',
  seoDesc: 'HDPE scrap in Pakistan: which grades we buy, what decides the price per kg, inspection and payment, plus recycled HDPE regrind and pellets for manufacturers.',
  focus: 'hdpe scrap in pakistan',
  category: 'HDPE scrap and recycled HDPE',
  schemaMaterial: 'High-density polyethylene (HDPE)',
  chips: ['We buy scrap', 'We supply regrind & pellets', 'All grades', 'Nationwide collection', 'Karachi'],
  sections: [
    {
      h2: 'What counts as HDPE scrap',
      paras: [
        'HDPE — high-density polyethylene, density roughly <strong>0.94 to 0.96 g/cm³</strong> — is the plastic used for jerry cans, drums, crates, caps, pipe, cable covering and much industrial packaging. Scrap arises at three points: offcuts and rejects inside a factory, purge and start-up lumps from an extruder, and finished products at end of life.',
        'The single most important thing to understand about HDPE scrap pricing is that "HDPE" alone is not a grade. Two loads of HDPE can differ by three or four times in value depending on the application it came from, the melt flow index, the colour, and how much metal and moisture is inside it.'
      ]
    },
    {
      h2: 'HDPE scrap grades we buy in Pakistan',
      table: [
        ['Blow-moulding scrap', 'Jerry cans, drums, containers, water tanks. Usually high molecular weight, good value when clean and single-colour.'],
        ['Injection scrap', 'Crates, pallets, caps, closures, housewares. Higher melt flow, often mixed colour.'],
        ['Pipe-grade scrap', 'PE63, PE80 and PE100 pipe — offcuts, rejected lengths, decommissioned mains. Valuable when the grade is known and the pipe is not contaminated with soil or water.'],
        ['Cable-cover scrap', 'The outer HDPE sheath stripped from cable. Clean and consistent, but must be separated from the inner insulation.'],
        ['Film and sheet scrap', 'Industrial liners and heavy film — lower bulk density, so baling matters.'],
        ['Off-grade and purge', 'Lumps, start-up material, coloured purging. Priced on contamination and colour rather than application.'],
        ['Regrind and agglomerate', 'Already-processed material offered by other recyclers.'],
        ['Post-consumer hard plastics', 'Mixed domestic HDPE — bottles, cans, household items. Needs sorting and washing before it becomes useful.']
      ],
      note: 'If you are not sure which grade your material is, send photographs, the application it came from, and the colour. That is usually enough to give you a real number instead of a range.'
    },
    {
      h2: 'What decides the price per kilogram',
      table: [
        ['Resin class and MFI', 'PE100 is not PE63, and a blow-moulding grade with low melt flow behaves differently from an injection grade. If you know the original application, say so — it raises the price.'],
        ['Colour', 'Natural and white are worth most because they can be re-coloured. Mixed colour is lower. Black is lowest, because it can only go back into black products.'],
        ['Contamination', 'Metal, stone, rubber, paper, wood and other polymers all cost money to remove. A load with metal is priced as a load with metal.'],
        ['Moisture', 'Wet scrap is paid for partly as water. Film and washed flake hold moisture; dry material is worth more per kilo of polymer.'],
        ['Form and bulk density', 'Baled or shredded material moves more polymer per truck than loose film or whole containers.'],
        ['Volume and regularity', 'A regular monthly tonnage is worth more per kilo than a one-off load, because it can be planned into production.'],
        ['Location', 'Freight to Karachi is deducted from the price. Material already in or near Karachi is at an advantage.']
      ]
    },
    {
      h2: 'How selling HDPE scrap to us works',
      list: [
        '<strong>Send the details</strong> — photographs of the material, approximate quantity, colour, form (bales, loose, regrind), and the city it is in.',
        '<strong>We give a price per kilogram</strong>, with the basis stated: what grade we are treating it as, and what deductions apply for contamination or moisture.',
        '<strong>Inspection</strong> — for a first load we sample. Large or mixed loads are inspected at our plant in the Shershah Industrial Area, Karachi.',
        '<strong>Weighing</strong> — on a calibrated weighbridge, with the slip available to you. Weight disputes are the most common argument in scrap trading and the easiest to avoid.',
        '<strong>Payment terms agreed in writing before dispatch</strong>, not after the truck has arrived.'
      ],
      note: 'We are buyers as well as recyclers, so we can tell you honestly when a load is better sold to a different processor — for example heavily filled or heavily printed material that our washing line cannot clean economically.'
    },
    {
      h2: 'What we supply back: recycled HDPE',
      paras: [
        'Because we process what we buy, we also supply recycled HDPE to manufacturers: <strong>regrind, flakes and pellets</strong>, in the grades that come off our own washing and pelletising lines. If you are buying, the same variables run the other way — ask for the melt flow index, the colour, and whether it is washed, and ask for a sample before committing to a monthly contract.',
        'Buying recycled HDPE on price alone is how manufacturers end up with production problems three weeks later. A few rupees per kilo saved against a batch of inconsistent melt flow is not a saving.'
      ]
    },
    {
      h2: 'The quality checks that matter in recycled HDPE',
      table: [
        ['Melt flow index (MFI)', 'The single most useful number. It tells you how the material will flow in your machine, and whether it matches your virgin grade.'],
        ['Density', 'Confirms the material is HDPE rather than a PP or mixed stream.'],
        ['Moisture content', 'Wet regrind produces voids, streaks and weak parts.'],
        ['Metal content', 'A metal detector on the line catches what hand sorting misses.'],
        ['Colour consistency', 'Within a batch and between batches — inconsistency shows up in the finished product.'],
        ['Filler content', 'Heavily filled material looks like HDPE but behaves nothing like it.']
      ]
    },
    {
      h2: 'Where the material comes from and goes to',
      paras: [
        'We buy across Pakistan — Karachi and Sindh, Punjab (Lahore, Faisalabad, Gujranwala, Sialkot, Multan), Khyber Pakhtunkhwa and Islamabad — and we deliver recycled material nationwide. Factories, utilities, contractors, municipal collections and other recyclers all sell to us; manufacturers of pipe, crates, film and injection mouldings buy from us.',
        'If you are a generator with regular tonnage — a packaging plant, a pipe factory, a cable manufacturer — the most valuable thing you can do is keep the streams separate. Mixed-colour mixed-polymer material is worth a fraction of the same tonnage kept apart.'
      ]
    }
  ],
  faqs: [
    ['Do you buy HDPE scrap in Pakistan?', 'Yes. We buy HDPE scrap across Pakistan — blow-moulding, injection, pipe, cable cover, film, off-grade and purge — and process it at our plant in the Shershah Industrial Area, Karachi.'],
    ['How much is HDPE scrap worth per kg in Pakistan?', 'There is no single price: it depends on the grade, colour, contamination, moisture and volume. Natural blow-moulding scrap is worth several times mixed-colour purge. Send photographs and the quantity and we will quote against your actual material rather than a website range.'],
    ['Which HDPE grade is worth the most?', 'Generally clean natural-colour blow-moulding scrap and known pipe-grade material (PE100 pipe offcuts in particular), because they can go back into high-value products. Mixed-colour, heavily filled material is worth the least.'],
    ['Can you collect from my factory?', 'Yes, for viable quantities we arrange collection and can supply the vehicle. Send the location and approximate tonnage and we will confirm.'],
    ['How is the weight agreed?', 'On a calibrated weighbridge, with the slip made available to you. We agree the basis in writing before dispatch so there is no dispute after the truck arrives.'],
    ['Do you sell recycled HDPE regrind or pellets?', 'Yes — regrind, flakes and pellets from our own washing and pelletising lines, with the melt flow index and colour stated, and a sample available before you commit.'],
    ['What is the difference between HDPE regrind and pellets?', 'Regrind is scrap that has been ground into flakes and used directly. Pellets have been melted, filtered and re-pelletised, which gives more consistent bulk density and dosing but costs more.'],
    ['What contamination is not acceptable?', 'Metal, stone and other polymers reduce the price but do not necessarily disqualify a load. Hazardous or chemical-contaminated material, and heavily filled material, we will usually decline — and we will tell you why rather than waste your transport.']
  ],
  related: [
    ['HDPE 100 Pipe Scrap', 'PE100 pipe scrap grades and buying specification.', '/materials-we-deal/hdpe-100-pipe-scrap/'],
    ['HDPE 80 & 60 Pipe Scrap', 'Lower-grade PE pipe scrap for non-pressure uses.', '/materials-we-deal/hdpe-80-scrap/'],
    ['HDPE Jerry Can Scrap', 'Blow-moulded container scrap.', '/materials-we-deal/hdpe-jerry-can-scrap/'],
    ['HDPE Cable Cover Scrap', 'Cable sheath scrap grades.', '/materials-we-deal/hdpe-cable-cover-scrap/'],
    ['LDPE Scrap in Pakistan', 'Film scrap, grades and pricing factors.', '/ldpe-scrap-pakistan/'],
    ['HDPE 100 Pipes', 'PE100 pipe we manufacture in Karachi.', '/hdpe-pipes-pakistan/']
  ]
};

export const LDPE_SCRAP = {
  slug: 'ldpe-scrap-pakistan',
  kicker: 'WE BUY AND SUPPLY · LDPE SCRAP',
  h1: 'LDPE Scrap in Pakistan — Film Grades, Prices and How to Sell It',
  lede: 'LDPE scrap in Pakistan is mostly film, and film behaves differently from rigid scrap: it is bulky, it holds moisture, and preparation decides the price. Here is what we buy, what moves the price per kg, and how to sell it properly.',
  seoTitle: 'LDPE Scrap in Pakistan | Film Buyers & Grades',
  seoDesc: 'LDPE scrap in Pakistan: which film and moulding grades we buy, how baling and moisture change the price per kg, inspection and payment, plus recycled LDPE supply.',
  focus: 'ldpe scrap in pakistan',
  category: 'LDPE scrap and recycled LDPE',
  schemaMaterial: 'Low-density polyethylene (LDPE)',
  chips: ['We buy scrap', 'Film specialists', 'Baled or loose', 'Nationwide collection', 'Karachi'],
  sections: [
    {
      h2: 'What LDPE scrap is and why it behaves differently',
      paras: [
        'LDPE — low-density polyethylene, density around <strong>0.91 to 0.925 g/cm³</strong> — is the softer, more flexible polyethylene. In Pakistan the overwhelming majority of LDPE scrap is <strong>film</strong>: carrier bags, liners, shrink and stretch wrap, agricultural greenhouse film and packaging. Injection-moulded LDPE and cable insulation make up a much smaller share.',
        'Film is a different business from rigid scrap. A tonne of film takes up many times the volume of a tonne of crates, so a truck carries far less polymer unless the material is baled. Film also holds surface moisture, dirt and product residue, and it is usually printed — all three affect what it is worth.'
      ]
    },
    {
      h2: 'LDPE scrap grades we buy',
      table: [
        ['Natural film', 'Unprinted or lightly printed clear and natural liner and packaging film. The highest value LDPE stream, because it can go back into light-coloured products.'],
        ['Printed film', 'Carrier bags and printed packaging. The ink load limits how it can be reused, so it prices below natural.'],
        ['Stretch and shrink wrap', 'Pallet wrap from warehouses and logistics. Consistent and clean if the cores and strapping are removed.'],
        ['Agricultural film', 'Greenhouse and mulch film. Valuable tonnage, but usually carries soil, moisture and UV degradation — expect deductions.'],
        ['Cable insulation', 'Clean, consistent LDPE from cable stripping, must be separated from the sheath.'],
        ['Injection and moulding scrap', 'Caps, closures and moulded items, lower volume in Pakistan but straightforward material.'],
        ['Off-grade and purge', 'Start-up lumps and factory rejects, priced on contamination and colour.']
      ]
    },
    {
      h2: 'What decides the price per kilogram',
      table: [
        ['Colour and print', 'Natural, unprinted film is worth most. Heavy print and mixed colour reduce the price, because the recycled material can only go into dark or non-visible products.'],
        ['Moisture', 'Wet film is partly paid for as water. Material stored under cover is worth more for the same polymer.'],
        ['Contamination', 'Soil, organic residue, paper labels, strapping, wood and other polymers all cost money to remove. Agricultural film is the classic case.'],
        ['Baling', 'A pressed bale moves several times the polymer per truck compared with loose film. Unbaled film is usually priced lower because the freight is against you.'],
        ['Cores, tapes and strapping', 'Cardboard cores and adhesive tape are not polymer. Remove them and the price rises without any change to the film itself.'],
        ['MFI and grade', 'Film grades are not the same as injection grades. If the source application is known, say so.'],
        ['Volume and regularity', 'A monthly tonnage from one factory is worth more per kilo than an occasional load, because it can be planned into production.']
      ]
    },
    {
      h2: 'How to prepare LDPE film scrap so it is worth more',
      list: [
        '<strong>Keep it dry.</strong> Cover the stock. Moisture is the single easiest deduction to avoid.',
        '<strong>Remove cores, tapes and strapping</strong> before baling. These are the most common non-polymer contamination in film loads.',
        '<strong>Bale it</strong> if you have volume — it cuts freight per tonne sharply and makes handling possible.',
        '<strong>Keep natural and printed film separate</strong>, and keep greenhouse film away from clean liner film. Mixed loads get mixed prices.',
        '<strong>Keep other polymers out.</strong> A little PVC film or PP woven sack in an LDPE load is expensive to remove and downgrades the whole bale.',
        '<strong>Be straight about the source.</strong> Agricultural or post-consumer film is fine — we buy it — but it prices differently from factory offcuts.'
      ]
    },
    {
      h2: 'How selling LDPE scrap to us works',
      list: [
        '<strong>Send photographs</strong> of the material, the approximate tonnage, whether it is baled or loose, and the city.',
        '<strong>We quote per kilogram</strong> and state the basis: which grade we are treating it as and what deductions apply.',
        '<strong>Inspection and sampling</strong> for a first load, at our plant in the Shershah Industrial Area, Karachi.',
        '<strong>Weighbridge weight</strong> with the slip available to you.',
        '<strong>Payment terms agreed in writing before dispatch.</strong>'
      ],
      note: 'Freight is usually the deciding factor on film. For a distant load of low-bulk-density film the freight can exceed the material value, and no honest buyer can hide that — we will tell you when it is not worth moving.'
    },
    {
      h2: 'What we supply back: recycled LDPE',
      paras: [
        'We supply recycled LDPE as regrind, agglomerate and pellets from our own processing lines. Agglomeration is often used for film because it raises bulk density without a full pelletising pass; pelletising gives the more consistent product and costs more.',
        'When you buy, ask for the melt flow index, the colour, and whether the material is washed and dried, and take a sample before you commit to a monthly quantity.'
      ]
    },
    {
      h2: 'LDPE compared with HDPE and LLDPE',
      table: [
        ['LDPE', 'Density about 0.91–0.925. Soft, flexible, good clarity. Film, bags, liners, cable insulation.'],
        ['LLDPE', 'Density about 0.915–0.925 but stronger and tougher than LDPE at the same density. Stretch film and heavy-duty bags.'],
        ['HDPE', 'Density about 0.94–0.96. Stiff and strong. Jerry cans, crates, pipe, caps.']
      ],
      note: 'LLDPE and LDPE are often mixed in film streams and many recyclers accept them together, but tell us if you know which you have — it affects what the recycled material can be used for.'
    }
  ],
  faqs: [
    ['Do you buy LDPE scrap in Pakistan?', 'Yes. We buy LDPE film, stretch and shrink wrap, agricultural film, cable insulation and moulding scrap across Pakistan, and process it at our plant in the Shershah Industrial Area, Karachi.'],
    ['How much is LDPE scrap worth per kg in Pakistan?', 'It depends on colour and print, moisture, contamination, whether it is baled and the tonnage. Natural unprinted film is worth the most and wet agricultural film the least. Send photographs and tonnage for a real quote.'],
    ['Do you buy wet or dirty film?', 'We can, but it prices lower because the water and soil are paid for as part of the load and have to be removed. Keeping stock covered costs nothing and raises the price.'],
    ['Do I need to bale the film?', 'Not necessarily, but for anything beyond a small load baling cuts freight per tonne sharply. Loose film is usually priced lower because the transport cost is against the load.'],
    ['Can you collect from my factory or warehouse?', 'Yes, for viable quantities we arrange collection and can supply the vehicle. Send the location and approximate tonnage.'],
    ['Do you supply recycled LDPE?', 'Yes — regrind, agglomerate and pellets from our own lines, with the melt flow index and colour stated and a sample available before you commit.'],
    ['What is the difference between LDPE and LLDPE scrap?', 'Both are flexible polyethylenes and are often mixed in film streams. LLDPE is tougher at the same density and is common in stretch film. Tell us which you have if you know — it changes what the recycled material is suitable for.'],
    ['What is not acceptable in an LDPE load?', 'PVC film, PP woven sacks and heavy metal or organic contamination downgrade or disqualify a load, because separating them is expensive. Hazardous or chemically contaminated material we decline.']
  ],
  related: [
    ['HDPE Scrap in Pakistan', 'Rigid HDPE grades, pricing and how selling works.', '/hdpe-scrap-pakistan/'],
    ['LDPE material page', 'What LDPE is and the grades we handle.', '/materials/ldpe/'],
    ['Materials We Deal', 'Every polymer grade we buy and supply.', '/materials-we-deal/'],
    ['HDPE 100 Pipes', 'PE100 pipe we manufacture in Karachi.', '/hdpe-pipes-pakistan/']
  ]
};

// ---------------------------------------------------------------------------
export const SELLERS = {
  slug: 'pipe-sellers-pakistan',
  kicker: 'BUYING GUIDE · PVC AND HDPE',
  h1: 'PVC and HDPE Pipe Sellers in Pakistan — How to Choose One',
  lede: 'Most pipe problems in Pakistan are not manufacturing failures; they are buying mistakes — the wrong pressure class, an unlicensed seller, or a quote that leaves out freight and fittings. This page is the checklist we would want a buyer to run before ordering from anyone, including us.',
  seoTitle: 'PVC & HDPE Pipe Sellers in Pakistan | Buyer Checklist',
  seoDesc: 'How to choose a PVC or HDPE pipe seller in Pakistan: manufacturer vs dealer, PSQCA licence, SDR and PN, quote traps and delivery. Al Qaryan Industries, Karachi.',
  focus: 'pvc pipe sellers in pakistan',
  category: 'PVC and HDPE pipe supply',
  schemaMaterial: 'PVC-U and Polyethylene PE100',
  chips: ['Manufacturer vs dealer', 'PSQCA licence', 'SDR / PN explained', 'Quote checklist', 'Karachi since 2007'],
  sections: [
    {
      h2: 'Seller, dealer, manufacturer — why the word matters',
      paras: [
        'In Pakistan the words "seller", "dealer", "supplier" and "manufacturer" are used almost interchangeably in listings, but they are not the same business. A <strong>manufacturer</strong> extrudes the pipe and owns the formulation and the wall thickness. A <strong>dealer or distributor</strong> resells someone else\'s pipe, often without knowing which plant made which length. A <strong>trader</strong> may hold no stock at all and buy against your order.',
        'None of these is dishonest, but they answer different questions. A dealer can be the right choice for a small mixed order from stock. A manufacturer is the right choice when you need a specific pressure class, a consistent monthly programme, or someone accountable when a batch is out of specification.',
        'The practical test is one question: <strong>"Which plant made this pipe, and will you name it in writing?"</strong> A manufacturer answers immediately. A dealer who cannot answer is telling you what your recourse will look like if something goes wrong.'
      ]
    },
    {
      h2: 'Check the PSQCA licence, not the brochure',
      paras: [
        'Pipe sold in Pakistan against a Pakistan Standard carries a PSQCA licence, and the licence number is tied to a specific product and a specific plant. Ask for the licence number and check it, rather than accepting a logo printed on a catalogue cover.',
        'The same applies to quality management certification. ISO 9001 covers the plant\'s process control, not the pipe in your hand. A certificate is a starting point for a conversation, never a substitute for a test report against the standard you specified.'
      ],
      list: [
        'Ask for the <strong>PSQCA licence number</strong> and the plant address it belongs to — they should match.',
        'Ask which <strong>standard</strong> the pipe is made to: ISO 1452 or ASTM D1785/D2241 for PVC-U, ISO 4427 or DIN 8074/8075 for PE100.',
        'Ask for a <strong>batch test report</strong>: wall thickness, outside diameter and hydrostatic test result for the lot you are buying.',
        'Ask whether the pipe will be <strong>marked</strong> with the size, pressure class, standard and manufacturer — unmarked pipe cannot be traced.'
      ]
    },
    {
      h2: 'Get the pressure class right before you compare prices',
      paras: [
        'A price per metre is meaningless without the pressure class attached to it. The same outside diameter in the same material can carry very different pressures depending on wall thickness, and the cheap quote is usually the thinner wall.',
        'For HDPE the class is set by SDR — standard dimension ratio. A lower SDR means a thicker wall and a higher pressure rating, so <strong>SDR 17 in PE100 is PN 10 while SDR 11 in the same resin is PN 16</strong>. For PVC-U the equivalent classes run PN 6, PN 10, PN 12.5 and PN 16, and Schedule 40 and Schedule 80 describe wall thickness rather than pressure directly.',
        'If two quotes differ sharply, compare the SDR or Schedule lines before the totals. A difference of one SDR step is often the whole gap.'
      ],
      table: [
        ['HDPE PE100 — SDR 26', 'PN 6'],
        ['HDPE PE100 — SDR 21', 'PN 8'],
        ['HDPE PE100 — SDR 17', 'PN 10'],
        ['HDPE PE100 — SDR 13.6', 'PN 12.5'],
        ['HDPE PE100 — SDR 11', 'PN 16'],
        ['PVC-U — SDR 41', 'PN 6'],
        ['PVC-U — SDR 26', 'PN 10'],
        ['PVC-U — SDR 21', 'PN 12.5'],
        ['PVC-U — SDR 17', 'PN 16']
      ],
      note: 'These are standard pressure classes at 20 °C for water. Both materials lose pressure capability as temperature rises, so a line running warm must be derated against the standard you are specifying.'
    },
    {
      h2: 'The six things a pipe quote must state',
      paras: [
        'A quote that gives only a rate per metre cannot be compared with another one. Ask every seller to put the same six lines in writing — the ones who cannot are usually the ones whose rate will change after you have committed.'
      ],
      list: [
        '<strong>Material and class</strong> — PVC-U PN 10, or PE100 SDR 17 / PN 10. Not just "HDPE pipe".',
        '<strong>Size basis</strong> — outside diameter in mm, and whether you are being quoted on OD or bore.',
        '<strong>Length</strong> — 6 m lengths, 12 m lengths or coils, and whether cut lengths are available.',
        '<strong>Fittings and jointing</strong> — are bends, tees, couplers and solvent cement included or extra?',
        '<strong>Freight</strong> — delivered to site, or ex-plant? This is the most common hidden addition.',
        '<strong>Validity and payment terms</strong> — polymer prices move, so a rate with no validity date is not a rate.'
      ]
    },
    {
      h2: 'Where Al Qaryan Industries fits',
      paras: [
        'We are a manufacturer, not a reseller. Al Qaryan Industries LLC extrudes PVC (uPVC) and HDPE (PE100) pipe at our own plant in the Shershah Industrial Area, Karachi, and supplies <strong>500 tons per month</strong> of each family with room to scale for scheduled programmes. The plant is ISO 9001 and ISO 14001 certified and pipe production is PSQCA licensed.',
        'We have traded plastics from Karachi since 2007, and the pipe lines sit beside our recycling division — so the compound is produced and controlled in-house rather than bought in and taken on trust. We also buy pipe scrap and offcuts back from fabricators and contractors, which keeps the material in the same loop.',
        'We do not publish a rate per metre, because the honest inputs are your size, your pressure class, your quantity and your delivery point. Send those four and you get a written price with a validity date, freight included and stated separately.'
      ]
    },
    {
      h2: 'Mistakes that cost buyers the most',
      paras: [
        'These come up repeatedly in enquiries, and every one of them is avoidable at the quotation stage.'
      ],
      list: [
        '<strong>Comparing PN 6 with PN 10.</strong> Both are "PVC pipe"; one is half the wall. Check the class before the price.',
        '<strong>Ignoring temperature.</strong> PVC-U is a cold-water product. Running it hot, or specifying it for a line that will see hot discharge, is a failure waiting to happen.',
        '<strong>Buying on outside diameter alone.</strong> Two pipes of the same OD can have different wall thickness and pressure ratings.',
        '<strong>Forgetting fittings in the budget.</strong> On short runs, fittings and jointing can be a meaningful share of the cost.',
        '<strong>No written validity.</strong> Polymer prices move; a verbal rate from three weeks ago is not a quote.',
        '<strong>Unmarked pipe.</strong> If the size, class and maker are not printed on the pipe, you cannot prove what you were sold.'
      ]
    }
  ],
  faqs: [
    ['How do I know if a pipe seller in Pakistan is a manufacturer?', 'Ask which plant made the pipe and whether they will name it in writing, then ask for the PSQCA licence number and the plant address it belongs to. A manufacturer answers both immediately. A dealer may be perfectly legitimate, but you should know which one you are dealing with before you rely on them for a specification.'],
    ['What is the difference between PVC and uPVC pipe?', 'They are the same product. uPVC stands for unplasticised polyvinyl chloride, written PVC-U in the standards. The "u" means no plasticiser was added, which is what makes rigid pressure pipe possible. It is not a grade, a brand or a premium version.'],
    ['What does SDR mean in HDPE pipe?', 'SDR is the standard dimension ratio — the outside diameter divided by the wall thickness. A lower SDR means a thicker wall and a higher pressure rating: in PE100, SDR 17 is PN 10 and SDR 11 is PN 16. Quoting without the SDR is quoting without the pressure class.'],
    ['Which is cheaper, PVC or HDPE pipe?', 'It depends on size, pressure class, quantity and delivery point, and we will not pretend otherwise with a headline figure. As a general rule PVC-U is the more economical choice for cold-water and drainage work, while HDPE competes where flexibility, coiled lengths, trenchless installation or chemical resistance matter. Send the requirement and we will quote both so you can compare like for like.'],
    ['Do you deliver outside Karachi?', 'Yes. We deliver across Pakistan and confirm freight and lead time in the quotation. Give us the delivery location with the enquiry so the freight line is real rather than estimated.'],
    ['Can you supply both PVC and HDPE on one order?', 'Yes. Both families are extruded at the same plant, so a mixed order ships on one schedule with one point of accountability instead of two suppliers blaming each other.']
  ],
  related: [
    ['PVC Pipes in Pakistan', 'uPVC pressure classes, Schedule 40 and 80, and how to check a manufacturer.', '/pvc-pipes-pakistan/'],
    ['HDPE 100 Pipes in Pakistan', 'PE100 grades, SDR to PN ratings and supplier checks.', '/hdpe-pipes-pakistan/'],
    ['PVC vs HDPE Pipe', 'Which material to specify, and where each one fails.', '/pvc-vs-hdpe-pipes-pakistan/'],
    ['Pipe Price Guide', 'What actually drives the rate per metre in Pakistan.', '/pipe-price-guide-pakistan/']
  ]
};

// ---------------------------------------------------------------------------
export const COMPARE = {
  slug: 'pvc-vs-hdpe-pipes-pakistan',
  kicker: 'BUYING GUIDE · CHOOSING A MATERIAL',
  h1: 'PVC vs HDPE Pipe in Pakistan — Which Should You Specify?',
  lede: 'Both are plastic pressure pipes, both are sold by the metre, and neither is universally better. The right answer depends on temperature, ground conditions, jointing skill on site and whether the line will be buried, coiled or run overhead. This page sets out where each material wins and where it fails.',
  seoTitle: 'PVC vs HDPE Pipe in Pakistan | Which to Choose',
  seoDesc: 'PVC or HDPE pipe for your project in Pakistan? Compare pressure classes, jointing, temperature limits, flexibility, chemical resistance and cost drivers.',
  focus: 'pvc vs hdpe pipe',
  category: 'PVC-U and PE100 pipe comparison',
  schemaMaterial: 'PVC-U and Polyethylene PE100',
  chips: ['Pressure classes', 'Jointing methods', 'Temperature limits', 'Cost drivers', 'Karachi manufacturer'],
  sections: [
    {
      h2: 'The short answer',
      paras: [
        'Choose <strong>PVC-U</strong> for cold-water distribution, drainage and sewer lines, where the route is fixed, the ground is stable and the budget is tight. Choose <strong>HDPE (PE100)</strong> where the line must flex — unstable or settling ground, trenchless crossing, rocky backfill — where long coiled lengths save joints, where the fluid is aggressive, or where the pipe will be handled roughly before installation.',
        'If a single sentence has to decide it: <strong>PVC is cheaper to buy and stiffer to install; HDPE is more forgiving and more expensive to buy at the same pressure class.</strong>'
      ]
    },
    {
      h2: 'Pressure rating is not comparable between the two',
      paras: [
        'Both materials express pressure capability through wall thickness, but the class systems differ, which is where comparisons go wrong. HDPE uses SDR; PVC-U uses PN classes directly, and Schedule 40 and 80 describe wall thickness rather than a pressure figure.',
        'A PE100 SDR 17 pipe and a PVC-U SDR 17 pipe are not equivalent products even though the SDR number matches — the resins have different design stresses. Compare <em>pressure class at your design temperature</em>, never the SDR number alone.'
      ],
      table: [
        ['HDPE PE100 SDR 26', 'PN 6', 'Low-pressure irrigation, gravity mains'],
        ['HDPE PE100 SDR 17', 'PN 10', 'Water distribution, common default'],
        ['HDPE PE100 SDR 11', 'PN 16', 'High-pressure mains, pumping lines'],
        ['PVC-U SDR 41', 'PN 6', 'Low-pressure distribution'],
        ['PVC-U SDR 26', 'PN 10', 'Standard municipal water lines'],
        ['PVC-U SDR 17', 'PN 16', 'High-pressure cold water'],
        ['PVC-U Schedule 40', 'Wall-thickness class', 'Common in process and plumbing work'],
        ['PVC-U Schedule 80', 'Heavier wall', 'Higher pressure, thicker wall']
      ],
      note: 'All values are standard classes at 20 °C for water. Above 20 °C both materials must be derated against the standard you are specifying — never assume the 20 °C figure holds on a warm line.'
    },
    {
      h2: 'Joining: where most site problems come from',
      paras: [
        'The joint is usually the weakest point in a plastic pipeline, and the two materials demand completely different skills from the crew.'
      ],
      list: [
        '<strong>PVC-U</strong> joins by solvent cement, rubber-ring push-fit or flange. Solvent cement is fast and cheap but unforgiving: the cut must be square, the surface clean and the cement applied evenly. A hurried joint fails months later, not on the day.',
        '<strong>HDPE</strong> joins by butt fusion, electrofusion, compression fittings or flange. Butt fusion produces a joint as strong as the pipe wall, but it needs a properly calibrated fusion machine and an operator who follows the cycle — a cold or contaminated joint will pass a visual check and fail in service.',
        'If your site has no fusion equipment and no trained operator, HDPE\'s advantages disappear quickly. That single practical point decides many projects.'
      ]
    },
    {
      h2: 'Temperature, sunlight and chemical resistance',
      paras: [
        'PVC-U is a cold-water material. Its pressure capability falls away as temperature rises, and it should not be specified for hot-water service at all — that is CPVC or PPR territory. It is also vulnerable to some solvents and to prolonged UV exposure, which is why black or UV-stabilised compounds are used outdoors.',
        'HDPE handles higher temperatures than PVC-U, but only with derating, and it must be protected from sustained direct sun in thin-wall sizes. Against chemicals, HDPE generally tolerates a wider range — which is why it dominates industrial and effluent lines — while PVC-U is excellent against many acids and is often the cheaper answer for those specific duties.',
        'Neither material is a general-purpose answer to "will it survive this chemical". Always check the specific concentration and temperature against a chemical resistance table before specifying.'
      ]
    },
    {
      h2: 'Movement, ground conditions and installation',
      paras: [
        'HDPE expands and contracts considerably more than PVC-U with temperature change — roughly a few times more per degree — so long runs need expansion provision, and snaking or looped laying is normal practice. PVC-U moves less but is rigid, so it transmits load and cannot be deflected around an obstruction.',
        'HDPE can be supplied in long coils in the smaller diameters, which removes most joints from a buried run and is the main reason it wins on long rural mains. PVC-U comes in rigid lengths, needs more joints, and needs trench bedding that will not point-load the pipe.',
        'In settling ground, HDPE\'s flexibility is decisive. In stable ground with a skilled crew, PVC-U\'s stiffness and lower cost usually win.'
      ]
    },
    {
      h2: 'What actually drives the cost difference',
      paras: [
        'The gap between a PVC and an HDPE quote is rarely one number. It comes from four places: the resin and compound (virgin versus recycled content, and the grade), the wall thickness your pressure class demands, the diameter, and the jointing method including fittings and labour.',
        'HDPE is lighter per metre for the same duty, so freight and handling can favour it on long runs even where the pipe rate is higher. PVC-U is heavier, so transport cost matters more on distant deliveries.',
        'We quote both families from the same plant, which means you can compare them on one sheet instead of two suppliers\' incompatible formats.'
      ]
    }
  ],
  faqs: [
    ['Is HDPE better than PVC pipe?', 'Not universally. HDPE is more flexible, tolerates rougher handling and a wider range of chemicals, and can be supplied in long coils that remove joints. PVC-U is stiffer, cheaper at the same duty, and easier to join without specialist equipment. The right choice depends on ground conditions, temperature, fluid and the skill available on site.'],
    ['Can I use PVC pipe for hot water?', 'No. PVC-U is a cold-water material and its pressure capability falls sharply as temperature rises. Hot-water service needs CPVC or PPR. Specifying PVC on a hot line is one of the most common and most expensive mistakes we see.'],
    ['Which pipe is better for underground water supply in Pakistan?', 'Both are used widely. PVC-U is the usual choice for stable ground and municipal distribution because it is economical and stiff. HDPE is preferred where ground moves, where the route crosses under roads or obstacles, or where long coiled lengths reduce the number of joints.'],
    ['How long do PVC and HDPE pipes last?', 'Both are designed for a 50-year service life when specified, installed and operated within the standard conditions the class assumes. Pressure class, temperature, bedding, joint quality and UV exposure in service all affect that figure — a 50-year rating at 20 °C does not transfer to a warm, poorly bedded line.'],
    ['Is HDPE pipe more expensive than PVC?', 'Usually the pipe rate is higher for HDPE at the same pressure class, but the total installed cost often narrows: HDPE is lighter to freight, coils remove joints, and trenchless installation can avoid excavation entirely. Compare installed cost, not just rate per metre.'],
    ['Do you manufacture both?', 'Yes. Al Qaryan Industries extrudes both PVC (uPVC) and HDPE (PE100) pipe at our plant in Shershah Industrial Area, Karachi, at 500 tons per month of each family, with room to scale for scheduled programmes.']
  ],
  related: [
    ['PVC Pipes in Pakistan', 'uPVC pressure classes and how to verify a manufacturer.', '/pvc-pipes-pakistan/'],
    ['HDPE 100 Pipes in Pakistan', 'PE100 grades and the SDR to PN table.', '/hdpe-pipes-pakistan/'],
    ['Pipe Sellers in Pakistan', 'How to choose a seller and what a quote must state.', '/pipe-sellers-pakistan/'],
    ['Pipe Price Guide', 'What drives the rate per metre.', '/pipe-price-guide-pakistan/']
  ]
};

// ---------------------------------------------------------------------------
export const PRICE = {
  slug: 'pipe-price-guide-pakistan',
  kicker: 'BUYING GUIDE · UNDERSTANDING PRICE',
  h1: 'PVC and HDPE Pipe Price in Pakistan — What Drives the Rate',
  lede: 'A published rate per metre for plastic pipe is out of date the moment polymer prices move, which is why we do not print one. What we can do is show you exactly which variables decide the number, so that two quotes become comparable and nothing appears after you commit.',
  seoTitle: 'PVC & HDPE Pipe Price in Pakistan | Rate Factors',
  seoDesc: 'What sets PVC and HDPE pipe price per metre in Pakistan: resin grade, SDR and wall thickness, diameter, quantity and delivery. Get a written quote from Karachi.',
  focus: 'pvc pipe price in pakistan',
  category: 'PVC and HDPE pipe pricing',
  schemaMaterial: 'PVC-U and Polyethylene PE100',
  chips: ['No stale price list', 'SDR drives wall', 'Freight stated', 'Written validity', 'Karachi plant'],
  sections: [
    {
      h2: 'Why we do not publish a price list',
      paras: [
        'Plastic pipe is priced off resin, and resin is a commodity that moves with oil, import parity and the rupee. A price list published this month is a complaint next month — either it is above the market and you overpay, or it is below and the seller quietly substitutes a thinner wall or a lower grade to protect the margin.',
        'The second reason is that "per metre" hides the only variable that matters: the pressure class. The same diameter in PN 6 and PN 16 is not the same product and not the same price. Any published single figure for "PVC pipe" is therefore either an assumption or a marketing number.',
        'What you should ask for instead is a written rate with the class, size, length and validity date printed on it. That is comparable. A headline figure is not.'
      ]
    },
    {
      h2: 'The seven variables that set your price',
      paras: [
        'Every pipe quotation is a function of these. Change one and the number moves — which is also why two quotes that look different are often both correct.'
      ],
      list: [
        '<strong>Material and grade.</strong> PE100 costs more than PE80 or PE63. In PVC, the compound and the additive package matter, and recycled content changes both price and the applications it is suitable for.',
        '<strong>Pressure class.</strong> Lower SDR or higher PN means more wall, more material per metre. This is usually the biggest single driver.',
        '<strong>Diameter.</strong> Material per metre rises with diameter faster than most buyers expect, because both the circumference and the wall increase.',
        '<strong>Quantity.</strong> A single length and a full truckload are different transactions — one is picked from stock, the other is scheduled on the line.',
        '<strong>Length and form.</strong> Standard 6 m or 12 m lengths versus cut lengths; coils versus straight lengths in HDPE. Coils cost more to produce and to freight.',
        '<strong>Delivery distance.</strong> Plastic pipe is bulky and, in PVC\'s case, heavy. Karachi to Lahore is a real cost, not a rounding error.',
        '<strong>Payment terms and validity.</strong> A rate held for 30 days carries a different risk to a rate held for 90. Say which you need.'
      ]
    },
    {
      h2: 'Additives and colour are not decoration',
      paras: [
        'For HDPE, carbon black is added for UV resistance and is normally specified at around two per cent by the standards — it is a performance requirement, not a colour choice, and pipe intended for outdoor exposure should state it.',
        'For PVC-U, the stabiliser system and any UV package affect both the price and how the pipe behaves in sun. Colour is usually functional: grey or white for water, other colours for specific services, and colour changes mean a separate production run at small quantities.',
        'If a quote is materially below others for the same stated class, the difference is usually in the compound, the additive package or the wall thickness. Ask which.'
      ]
    },
    {
      h2: 'How to compare two pipe quotes properly',
      paras: [
        'Put both quotes side by side on these six lines. If a seller cannot fill them in, the comparison is not real yet.'
      ],
      table: [
        ['Material + class', 'PVC-U PN 10 / PE100 SDR 17 — not "PVC pipe"'],
        ['Size basis', 'Outside diameter in mm, stated explicitly'],
        ['Lengths + form', '6 m, 12 m or coils; cut lengths or standard'],
        ['Fittings', 'Included or extra, and which jointing method'],
        ['Freight', 'Delivered or ex-plant, stated as its own line'],
        ['Validity', 'Number of days the rate holds']
      ],
      note: 'If one quote is dramatically cheaper, compare the pressure class line first. A one-step SDR difference usually explains the entire gap.'
    },
    {
      h2: 'What we need to quote you accurately',
      paras: [
        'Four things, and we can answer the same day in most cases: the <strong>size</strong> (outside diameter), the <strong>pressure class or SDR</strong>, the <strong>quantity</strong> in metres or tons, and the <strong>delivery location</strong>. Add the application if you have it — buried main, irrigation, effluent, process line — because it sometimes changes the recommendation.',
        'Al Qaryan Industries manufactures both PVC (uPVC) and HDPE (PE100) pipe at our plant in the Shershah Industrial Area, Karachi, at <strong>500 tons per month</strong> of each family. Because we extrude rather than resell, the quote you receive is tied to our own line and our own compound, with a stated validity — not a rate passed down a chain.'
      ]
    }
  ],
  faqs: [
    ['Why is there no price list on your website?', 'Because plastic pipe is priced off a moving commodity. A published rate goes stale within weeks and encourages sellers to protect margin by thinning the wall or downgrading the compound. We quote in writing against your size, pressure class, quantity and delivery point, with a validity date.'],
    ['What is the biggest factor in pipe price?', 'The pressure class, because it sets the wall thickness and therefore how much material is in every metre. A lower SDR or higher PN class can move the price more than any other single variable. Diameter and quantity come next.'],
    ['Does recycled content make pipe cheaper?', 'It can reduce the material cost, but the application decides whether it is acceptable at all. Pressure pipe is specified against a standard and a class, and the compound must meet it. Ask any supplier to state the recycled content and the standard the pipe is made to, then decide whether that combination suits your duty.'],
    ['How quickly can you quote?', 'Same day in most cases once we have the size, pressure class, quantity and delivery location. Add the application and we can also tell you if a different class would serve you better.'],
    ['Do you quote delivered or ex-plant?', 'Both, and the freight is shown as its own line so you can see what delivery costs. Give us the site location with the enquiry and the freight figure is real rather than a placeholder.'],
    ['Can I get both PVC and HDPE priced together?', 'Yes. Both families are extruded at the same plant, so you receive one comparable sheet instead of two formats from two suppliers.']
  ],
  related: [
    ['Pipe Sellers in Pakistan', 'How to choose a seller and the six lines every quote needs.', '/pipe-sellers-pakistan/'],
    ['PVC vs HDPE Pipe', 'Which material to specify for your duty.', '/pvc-vs-hdpe-pipes-pakistan/'],
    ['PVC Pipes in Pakistan', 'uPVC classes, Schedule 40 and 80.', '/pvc-pipes-pakistan/'],
    ['HDPE 100 Pipes in Pakistan', 'PE100 grades and SDR to PN.', '/hdpe-pipes-pakistan/']
  ]
};

export const GUIDES = [HDPE, PVC, HDPE_SCRAP, LDPE_SCRAP, SELLERS, COMPARE, PRICE];

export default render;
