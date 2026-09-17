// Quick test for parseBossWhen (the fix for "today 7pm")
import { parseBossWhen } from './waWebClient.js';

const dubai = (ms) => ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' (Dubai)' : 'FAIL (0)';
const cases = ['today 7pm', 'today 7 pm', '7 pm', '7pm', 'tomorrow 9am', '18-09-2026 10:00', 'in 2 hours', 'tonight', 'today at 4 pm', '7:30pm', 'at 6 am'];
for (const s of cases) console.log((s + '                    ').slice(0, 20), '=>', dubai(parseBossWhen(s)));
process.exit(0);
