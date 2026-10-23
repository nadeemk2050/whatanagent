import net from 'node:net';

const IP = '101.32.170.58';
const ports = [
  { p: 22, name: 'SSH' },
  { p: 80, name: 'HTTP' },
  { p: 443, name: 'HTTPS' },
  { p: 3389, name: 'RDP (Windows only)' }
];

function tcp(port, timeout = 6000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = new net.Socket();
    let done = false;
    const fin = (ok, note) => {
      if (done) return;
      done = true;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      s.destroy();
      resolve({ ok, ms, note });
    };
    s.setTimeout(timeout);
    s.once('connect', () => fin(true, 'open'));
    s.once('timeout', () => fin(false, 'timeout/filtered'));
    s.once('error', (e) => fin(false, e.code || 'error'));
    s.connect(port, IP);
  });
}

(async () => {
  console.log('TENCENT LIGHTHOUSE 101.32.170.58 (Singapore)\n');
  for (const { p, name } of ports) {
    const r = await tcp(p);
    console.log('  port ' + String(p).padEnd(5) + name.padEnd(20) + (r.ok ? 'OPEN  ' : 'CLOSED') + '  ' + (r.ok ? r.ms.toFixed(0) + ' ms handshake' : r.note));
  }

  console.log('\nLATENCY COMPARISON from your PC');
  const rows = [
    { name: 'Tencent Singapore (new VPS)', host: '101.32.170.58', port: 22 },
    { name: 'Render ingress (current)', host: 'whatanagent.onrender.com', port: 443 },
    { name: 'Alibaba DashScope (AI)', host: 'dashscope-intl.aliyuncs.com', port: 443 }
  ];
  for (const r of rows) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const x = await tcp(r.port, 8000);
      if (x.ok) samples.push(x.ms);
      await new Promise(z => setTimeout(z, 150));
    }
    if (!samples.length) { console.log('  ' + r.name.padEnd(32) + 'unreachable'); continue; }
    samples.sort((a, b) => a - b);
    console.log('  ' + r.name.padEnd(32) + 'min ' + samples[0].toFixed(0).padStart(4) + ' ms   median ' + samples[Math.floor(samples.length / 2)].toFixed(0).padStart(4) + ' ms');
  }
})();
