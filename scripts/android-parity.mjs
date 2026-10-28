#!/usr/bin/env node
// ============================================================================
// ANDROID PARITY GATE
// ============================================================================
// The AlignTasks PWA is the source of truth for navigation. This script fails when the PWA
// offers a screen that the Kotlin app's registry (Screens.kt) does not have — which is exactly
// how "the app is the same as the app" silently rots.
//
// Usage:  node scripts/android-parity.mjs          (exit 0 = in parity, 1 = drift)
// CI:     run it after any change to public/aligntasks/index.html or Screens.kt
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contractPath = path.join(root, 'parity.json');
const screensPath = path.join(root, 'android-kotlin/app/src/main/java/com/assigntask/app/Screens.kt');
const viewsPath = path.join(root, 'android-kotlin/app/src/main/java/com/assigntask/app/BoardLogic.kt');
const pwaPath = path.join(root, 'public/aligntasks/index.html');

function readOrDie(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`[parity] missing ${label}: ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

const contract = JSON.parse(readOrDie(contractPath, 'parity.json'));
const screensSrc = readOrDie(screensPath, 'Screens.kt');
const viewsSrc = readOrDie(viewsPath, 'BoardLogic.kt');
const pwaHtml = fs.existsSync(pwaPath) ? fs.readFileSync(pwaPath, 'utf8') : '';

const problems = [];

// ---- 1. every PWA screen exists in the Kotlin registry ---------------------
for (const s of contract.screens || []) {
  const inRegistry = screensSrc.includes(`"${s.key}"`);
  if (!inRegistry) problems.push(`screen "${s.key}" (${s.label}) is in the PWA but not in Screens.kt`);
}

// ---- 2. every PWA view exists in the Kotlin TaskView enum ------------------
for (const v of contract.views || []) {
  const inEnum = new RegExp(`\\("${v.key}",\\s*"`).test(viewsSrc);
  if (!inEnum) problems.push(`view "${v.key}" is in the PWA but not in TaskView (BoardLogic.kt)`);
}

// ---- 3. the PWA markup still has the element this contract refers to ------
for (const s of contract.screens || []) {
  const id = (s.pwa.match(/#([a-z0-9-]+)/i) || [])[1];
  if (id && pwaHtml && !pwaHtml.includes(`id="${id}"`) && !pwaHtml.includes(`data-view="${id}"`)) {
    problems.push(`PWA element #${id} referenced by "${s.key}" no longer exists — update parity.json`);
  }
}

// ---- 4. no Kotlin screen is silently orphaned ------------------------------
const declared = new Set([
  ...(contract.screens || []).map((s) => s.key),
  ...(contract.androidExtras || []).map((s) => s.key)
]);
const enumKeys = [...screensSrc.matchAll(/^\s+[A-Z_]+\("([a-zA-Z]+)",/gm)].map((m) => m[1]);
for (const key of enumKeys) {
  if (!declared.has(key)) problems.push(`Screens.kt declares "${key}" but parity.json does not list it (add it to screens or androidExtras)`);
}

// ---- report ---------------------------------------------------------------
const screens = (contract.screens || []).length;
const views = (contract.views || []).length;
const extras = (contract.androidExtras || []).length;

if (problems.length) {
  console.error(`[parity] FAIL — ${problems.length} drift(s) between the PWA and Android ${contract.version}:`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`[parity] OK — Android ${contract.version} covers ${screens} PWA screens, ${views} views (+${extras} native-only extras).`);
