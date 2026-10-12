// Temp: verify the deployed AlignTasks 2.0 is live on both hosts.
const targets = [
  'https://whatanagent-a1e59.web.app/aligntasks/',
  'https://whatanagent.onrender.com/aligntasks/'
];
for (const url of targets) {
  let done = false;
  for (let i = 1; i <= 30 && !done; i++) {
    try {
      const h = await (await fetch(url + '?v=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } })).text();
      const v2 = h.includes("WEB_APP_VERSION = '2.0'");
      const sw = h.includes('id="team-switcher"');
      const inv = h.includes('id="invites-section"');
      const ho = h.includes('wa-handoff-modal');
      if (v2 && sw && inv && ho) {
        console.log(url + ' -> 2.0 LIVE ✅ (version, switcher, invites, hand-off)');
        done = true;
      } else {
        console.log(url + ` attempt ${i} -> v2=${v2} switcher=${sw} invites=${inv} handoff=${ho}`);
        await new Promise(r => setTimeout(r, 15000));
      }
    } catch (e) { console.log(url + ' attempt ' + i + ' -> ' + e.message); await new Promise(r => setTimeout(r, 15000)); }
  }
  if (!done) console.log(url + ' -> NOT UPDATED ❌');
}
process.exit(0);
