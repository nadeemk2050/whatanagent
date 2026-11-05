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

export const GUIDES = [HDPE, PVC];

export default render;
