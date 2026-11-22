// Quick regression checks for the WhatsApp humaniser. Run: node scripts/human-voice-test.mjs
import {
  humanizeReplyText,
  splitWhatsAppMessages,
  typingDelayMs,
  containsRoboticPhrase
} from '../humanVoice.mjs';

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('PASS ' + name);
  else { failed += 1; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// 1. Markdown is stripped
const md = humanizeReplyText('**Bilkul**, aap ka order ready hai.\n\n- item one\n- item two\n\n# Heading');
check('markdown removed', !/\*\*|^\s*[-#]/m.test(md), JSON.stringify(md));

// 2. Robotic openers removed
const r1 = humanizeReplyText('Certainly! Main aap ki help kar sakta hoon.');
check('robotic opener removed', !/^certainly/i.test(r1) && r1.length > 0, JSON.stringify(r1));

// 3. "As an AI" removed
const r2 = humanizeReplyText('As an AI language model, I cannot see images. Aap text bhej dein.');
check('as-an-ai removed', !/as an ai/i.test(r2), JSON.stringify(r2));

// 4. Corporate phrase removed
const r3 = humanizeReplyText('Please be advised that the rate is market linked.');
check('stiff phrase removed', !/please be advised/i.test(r3) && !containsRoboticPhrase(r3), JSON.stringify(r3));

// 5. Emoji cap
const r4 = humanizeReplyText('Thanks 😊😊😊😊😊😊');
const emojiCount = (r4.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu) || []).length;
check('emoji capped at 2', emojiCount <= 2, 'count=' + emojiCount);

// 6. Long reply split into at most 3 parts
const long = Array.from({ length: 20 }, (_, i) => 'Yeh line number ' + (i + 1) + ' hai aur is mein kuch zaroori baat likhi hai.').join(' ');
const parts = splitWhatsAppMessages(long);
check('long reply <= 3 messages', parts.length >= 1 && parts.length <= 3, 'parts=' + parts.length);
check('split keeps content', parts.join(' ').includes('line number 20'));

// 7. Short reply stays one message
const short = splitWhatsAppMessages('Ji bilkul, theek hai.');
check('short reply is one message', short.length === 1 && short[0] === 'Ji bilkul, theek hai.');

// 8. Typing delay bounds
check('delay min 1.2s', typingDelayMs('short') === 1200);
check('delay max 6s', typingDelayMs('x'.repeat(1000)) === 6000);

// 9. Humaniser never introduces a blunt "no"
const r5 = humanizeReplyText('I cannot do that.');
check('no blunt-no injection', !/^no\b/i.test(r5));

if (failed) { console.log('\n' + failed + ' check(s) failed'); process.exit(1); }
console.log('\nAll human-voice checks passed');
