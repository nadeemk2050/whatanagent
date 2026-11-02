// Renders a long-form material page from a data object.
// Every sentence that carries meaning lives in the data files — this template
// only supplies structure, so no two material pages share body copy.

export function renderMaterial(m) {
  const chips = (m.chips || [])
    .map(function (c) { return '<span class="q-chip">' + c + '</span>'; })
    .join('');

  const sections = m.sections.map(renderSection).join('\n\n');

  const faqs = m.faqs
    .map(function (f) {
      return '<details class="q-faq"><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>';
    })
    .join('\n  ');

  const related = m.related
    .map(function (r) {
      return '<div class="q-card"><h3>' + r[0] + '</h3><p>' + r[1] + '</p><a class="q-link" href="/materials-we-deal/' + r[2] + '/">' + r[0] + '</a></div>';
    })
    .join('\n  ');

  return `<div class="q-hero q-hero--compact">
  <p class="q-kicker">${m.kicker}</p>
  <h1>${m.h1}</h1>
  <p class="q-lead">${m.lede}</p>
  <div class="q-chips">${chips}</div>
</div>

${sections}

${m.market ? `<div class="q-section">
  <h2>What moves the price of ${m.focusShort}</h2>
  ${m.market.map(function (p) { return '  <p>' + p + '</p>'; }).join('\n  ')}
</div>

` : ''}${m.enquiry ? `<div class="q-section">
  <h2>Specifying ${m.focusShort}: what to send us</h2>
  <ul class="q-list">
  ${m.enquiry.map(function (li) { return '  <li>' + li + '</li>'; }).join('\n  ')}
  </ul>
</div>

` : ''}<div class="q-section">
  <h2>Buying ${m.focusShort} from Al Qaryan Industries</h2>
  ${m.buying.map(function (p) { return '  <p>' + p + '</p>'; }).join('\n  ')}
</div>

<div class="q-section">
  <h2>Questions buyers and suppliers ask</h2>
  ${faqs}
</div>

<div class="q-section">
  <h2>Related materials</h2>
  <div class="q-grid q-grid--3">
  ${related}
  </div>
</div>

${m.cta}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${m.h1}","category":"Plastic scrap and recycled raw material","material":"${m.schemaMaterial}","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"${m.seoDesc}","offers":{"@type":"Offer","availability":"https://schema.org/InStock","businessFunction":"http://purl.org/goodrelations/v1#Sell","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`;
}

function renderSection(s) {
  const out = ['<div class="q-section">', '  <h2>' + s.h2 + '</h2>'];

  (s.paras || []).forEach(function (p) {
    out.push('  <p>' + p + '</p>');
  });

  if (s.list) {
    out.push('  <ul class="q-list">');
    s.list.forEach(function (li) { out.push('    <li>' + li + '</li>'); });
    out.push('  </ul>');
  }

  if (s.table) {
    out.push('  <table class="q-table">', '    <tbody>');
    s.table.forEach(function (row) {
      out.push('      <tr><th>' + row[0] + '</th><td>' + row[1] + '</td></tr>');
    });
    out.push('    </tbody>', '  </table>');
  }

  if (s.note) out.push('  <p class="q-note">' + s.note + '</p>');

  out.push('</div>');
  return out.join('\n');
}
