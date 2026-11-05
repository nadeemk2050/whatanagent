/* ==========================================================================
   COMMISSION ACCOUNTS — file exports
   --------------------------------------------------------------------------
   Two small, dependency-free writers:
     • toExcel()  — SpreadsheetML 2003 (.xls), which Excel, LibreOffice and
                    Google Sheets all open with real typed cells and widths.
     • toPdf()    — a minimal A4-landscape PDF (Helvetica, repeat header row,
                    page numbers) so "download PDF" really downloads a file
                    instead of opening a print dialog.
   Both are fed the same { title, subtitle, columns, rows } document.
   ========================================================================== */

const ASCII_MAP = {
  '—': '-', '–': '-', '‑': '-', '×': 'x', '✕': 'x',
  '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...',
  '·': '.', '•': '.', '→': '->', '✓': 'v', '₹': 'Rs'
};

const toAscii = (v) => String(v == null ? '' : v)
  .replace(/[^\x20-\x7E]/g, (c) => (ASCII_MAP[c] !== undefined ? ASCII_MAP[c] : '?'));

const escXml = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const num = (v) => {
  const raw = String(v == null ? '' : v).replace(/,/g, '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ Excel */
export function buildExcel({ title, subtitle, columns, rows, sheetName = 'Register' }) {
  const cols = columns.map(c => `<Column ss:AutoFitWidth="0" ss:Width="${c.num ? 90 : 150}"/>`).join('');

  const headCells = columns.map(c => `<Cell ss:StyleID="h"><Data ss:Type="String">${escXml(c.label)}</Data></Cell>`).join('');
  const bodyRows = rows.map(r => '<Row>' + r.map((v, i) => {
    const col = columns[i] || {};
    const n = col.num ? num(v) : null;
    if (n !== null) return `<Cell ss:StyleID="n"><Data ss:Type="Number">${n}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${escXml(v)}</Data></Cell>`;
  }).join('') + '</Row>').join('\n');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${escXml(title)}</Title>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E9EEF5" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/><Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9AA7B8"/>
   </Borders></Style>
  <Style ss:ID="n"><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${escXml(sheetName.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'Register')}">
  <Table>
   ${cols}
   <Row ss:Height="20">${headCells}</Row>
   ${bodyRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

/* ------------------------------------------------------------------ PDF */
const PAGE_W = 842;            // A4 landscape, points
const PAGE_H = 595;
const MARGIN = 26;

const pdfString = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

// Helvetica advance widths (1/1000 em) for the characters we actually print.
const W = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '[': 278, ']': 278, '_': 556, '|': 260, '\\': 278
};

function estimateWidth(text, size, bold) {
  const s = String(text == null ? '' : text);
  let units = 0;
  for (const ch of s) {
    const w = W[ch] !== undefined ? W[ch] : (/[0-9]/.test(ch) ? 556 : 556);
    units += w;
  }
  const factor = bold ? 1.06 : 1;   // Helvetica-Bold is a little wider
  return (units / 1000) * size * factor;
}

function fit(text, size, bold, maxWidth) {
  let s = String(text == null ? '' : text);
  if (estimateWidth(s, size, bold) <= maxWidth) return s;
  while (s.length > 1 && estimateWidth(s + '...', size, bold) > maxWidth) s = s.slice(0, -1);
  return s + '...';
}

function assemble(objects) {
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xref = out.length;
  out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach(o => { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return out;
}

export function buildPdf({ title, subtitle, columns, rows, footer }) {
  const bodySize = 7.4;
  const headSize = 7.6;

  // Column widths from content, then scaled to the page.
  const widths = columns.map((c, i) => {
    const longestHeader = String(c.label || '').length;
    let longest = longestHeader;
    for (const r of rows) {
      const t = String(r[i] == null ? '' : r[i]);
      if (t.length > longest) longest = t.length;
    }
    return { w: Math.max(34, Math.min(longest, 26) * (c.num ? 4.3 : 4.0) + 8), num: !!c.num };
  });
  const totalW = widths.reduce((a, x) => a + x.w, 0);
  const usable = PAGE_W - MARGIN * 2;
  const scale = usable / totalW;
  widths.forEach(x => { x.w = x.w * scale; });

  const rowH = 12.5;
  const headY = PAGE_H - MARGIN - 40;
  const firstRowY = headY - 14;
  const rowsPerPage = Math.max(6, Math.floor((firstRowY - MARGIN - 22) / rowH));
  const pages = [];
  for (let i = 0; i < Math.max(1, Math.ceil(rows.length / rowsPerPage)); i++) {
    pages.push(rows.slice(i * rowsPerPage, (i + 1) * rowsPerPage));
  }

  const text = (x, y, size, font, str) =>
    `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfString(toAscii(str))}) Tj ET\n`;
  const line = (x1, y1, x2, y2, w = 0.5, gray = 0) =>
    `${gray} G ${w} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;

  const streams = pages.map((pageRows, pageIndex) => {
    let s = '';
    // header band
    s += line(MARGIN, PAGE_H - MARGIN - 26, PAGE_W - MARGIN, PAGE_H - MARGIN - 26, 0.8, 0.2);
    s += text(MARGIN, PAGE_H - MARGIN - 14, 12, 'F2', title);
    if (subtitle) s += text(MARGIN, PAGE_H - MARGIN - 24, 7.5, 'F1', subtitle);

    let x = MARGIN;
    columns.forEach((c, i) => {
      const w = widths[i].w;
      const label = fit(c.label, headSize, true, w - 4);
      if (c.num) s += text(x + w - 4 - estimateWidth(label, headSize, true), headY, headSize, 'F2', label);
      else s += text(x + 2, headY, headSize, 'F2', label);
      x += w;
    });
    s += line(MARGIN, headY - 4, PAGE_W - MARGIN, headY - 4, 0.6, 0.45);

    let y = firstRowY;
    pageRows.forEach((r, ri) => {
      if (ri % 2 === 1) {
        s += `q 0.955 g ${MARGIN} ${(y - 3.4).toFixed(1)} ${(PAGE_W - MARGIN * 2).toFixed(1)} ${rowH.toFixed(1)} re f Q\n`;
      }
      let cx = MARGIN;
      columns.forEach((c, i) => {
        const w = widths[i].w;
        const raw = r[i] == null ? '' : r[i];
        const shown = fit(raw, bodySize, false, w - 5);
        if (c.num) s += text(cx + w - 4 - estimateWidth(shown, bodySize, false), y, bodySize, 'F1', shown);
        else s += text(cx + 2, y, bodySize, 'F1', shown);
        cx += w;
      });
      y -= rowH;
    });

    // footer
    const footY = MARGIN + 10;
    s += line(MARGIN, footY + 10, PAGE_W - MARGIN, footY + 10, 0.5, 0.6);
    if (footer) s += text(MARGIN, footY, 7.2, 'F1', footer);
    const pg = 'Page ' + (pageIndex + 1) + ' of ' + pages.length;
    s += text(PAGE_W - MARGIN - estimateWidth(pg, 7.2, false), footY, 7.2, 'F1', pg);
    return s;
  });

  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');                                    // 2 = Pages, filled later
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  for (const stream of streams) {
    const contentId = objects.length + 1;
    objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
    const pageId = objects.length + 1;
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] ' +
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentId + ' 0 R >>');
    pageIds.push(pageId);
  }
  objects[1] = '<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';
  return assemble(objects);
}

/* ------------------------------------------------------------------ download */
export function downloadFile(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
