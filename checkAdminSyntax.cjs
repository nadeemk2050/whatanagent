const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');
const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, failed = false;
while ((m = re.exec(html)) !== null) {
  i++;
  const code = m[1];
  if (/type="module"/i.test(m[0])) { console.log('script #' + i + ': skip (module)'); continue; }
  try {
    new vm.Script(code, { filename: 'admin.html<script#' + i + '>' });
    console.log('script #' + i + ': OK (' + code.length + ' chars)');
  } catch (e) {
    failed = true;
    console.log('script #' + i + ': SYNTAX ERROR -> ' + e.message);
  }
}
console.log(failed ? 'RESULT: FAILED' : 'RESULT: ALL SCRIPTS OK');
process.exit(failed ? 1 : 0);
