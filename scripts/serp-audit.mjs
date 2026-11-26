// SERP + competitor SEO audit — command line.
//
//   node scripts/serp-audit.mjs
//   node scripts/serp-audit.mjs --site arabianpolyplast.com --out SEO-COMPETITORS.md
//   node scripts/serp-audit.mjs --keywords "hdpe scrap in oman,pvc pipe scrap oman"
//   node scripts/serp-audit.mjs --audit 10 --max 30
//
// The engine lives in ../serpAudit.mjs so the Websites Workshop runs the exact
// same audit from its "SERP audit" button.
import { writeFileSync } from 'node:fs';
import { runSerpAudit } from '../serpAudit.mjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const site = argOf('site', 'arabianpolyplast.com');
const out = argOf('out', 'SEO-COMPETITORS.md');
const maxAudit = Number(argOf('audit', '10'));
const keywords = argOf('keywords', [
  'plastic scrap in oman',
  'hdpe scrap in oman',
  'scrap buyer in oman',
  'best pvc pipe buyer in oman',
  'pet bottle scrap in oman',
  'plastic scrap buyers in oman'
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

const started = Date.now();
const result = await runSerpAudit({
  site,
  keywords,
  maxAudit,
  log: (m) => console.log('[' + m + ']')
});

writeFileSync(out, result.markdown, 'utf8');
console.log('\n[report] ' + out + ' (' + result.markdown.length + ' chars, ' + ((Date.now() - started) / 1000).toFixed(1) + 's)');
console.log('[ours] rank for "' + result.keywords[0].keyword + '": ' + (result.ourRank || 'not in top ' + result.keywords[0].results.length));
for (const block of result.keywords) {
  console.log('\n' + block.keyword + '  (top ' + block.results.length + ', ' + block.results.filter(r => r.type === 'directory').length + ' directory)');
  for (const r of block.results.slice(0, 10)) {
    console.log('  ' + r.rank + '. ' + r.host + '  [' + r.type + ']  age ' + (r.ageYears === null ? '?' : r.ageYears.toFixed(1)) + 'y  ' + r.ms + 'ms');
  }
}
console.log('\n' + result.gaps.map(g => '• ' + g).join('\n'));
process.exit(0);
