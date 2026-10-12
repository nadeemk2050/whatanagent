// Temp: extract <script> blocks from an HTML file and syntax-check them.
import fs from 'fs';
import vm from 'vm';

const file = process.argv[2] || 'public/aligntasks/index.html';
const html = fs.readFileSync(file, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, ok = 0, bad = 0;
while ((m = re.exec(html)) !== null) {
  i++;
  if (/\bsrc\s*=/.test(m[1] || '')) continue;
  const code = m[2] || '';
  if (!code.trim()) continue;
  try { new vm.Script(code, { filename: file + '#' + i }); ok++; }
  catch (e) { bad++; console.log(`script #${i}: ❌ ${e.message}`); }
}
console.log(bad ? `FAIL: ${bad} broken script(s)` : `OK: ${ok} script block(s) valid`);
process.exit(bad ? 1 : 0);
