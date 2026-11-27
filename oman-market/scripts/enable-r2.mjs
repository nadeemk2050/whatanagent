#!/usr/bin/env node
// One-shot R2 setup for the Oman Scrap Market media bucket.
//
//   CF_API_TOKEN=... CF_ACCOUNT_ID=... node scripts/enable-r2.mjs
//
// What it does:
//   1. checks that R2 is enabled on the account (Cloudflare requires the owner to
//      click "Enable R2" in the dashboard once - there is no API for that step);
//   2. creates the media bucket (idempotent);
//   3. adds the MEDIA binding to wrangler.jsonc so the Worker writes photos to R2
//      and the existing KV path stays the fallback for older photos.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
const ACCOUNT = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const BUCKET = process.env.R2_BUCKET || 'oman-scrap-market-media';
const LOCATION = process.env.R2_LOCATION || 'apac';
const API = 'https://api.cloudflare.com/client/v4';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = join(root, 'wrangler.jsonc');

if (!TOKEN || !ACCOUNT) {
	console.error('Set CF_API_TOKEN (Workers R2 Storage: Edit) and CF_ACCOUNT_ID first.');
	process.exit(2);
}

const headers = { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' };

async function call(path, init) {
	const res = await fetch(API + path, { ...init, headers });
	const body = await res.json().catch(() => ({}));
	return { ok: res.ok && body.success !== false, body };
}

function explain(errors) {
	const code = errors?.[0]?.code;
	if (code === 10042) {
		console.error('\nR2 is not enabled on this Cloudflare account yet.');
		console.error('Owner step: dash.cloudflare.com -> R2 Object Storage -> Enable R2');
		console.error('(accept the terms, add a payment card - the 10 GB free tier needs it).');
		console.error('Then add the permission "Workers R2 Storage: Edit" to the API token.');
		console.error('Run this again afterwards.\n');
		return;
	}
	if (code === 10000) {
		console.error('\nThe API token cannot reach R2 (10000 Authentication error).');
		console.error('Owner step: dash.cloudflare.com -> My Profile -> API Tokens -> edit the token');
		console.error('-> add "Workers R2 Storage" with Edit, plus "Account Settings" Read, save,');
		console.error('then update the CLOUDFLARE_API_TOKEN secret in the GitHub repo.\n');
		return;
	}
	console.error('\nCloudflare said:', JSON.stringify(errors));
}

const buckets = await call('/accounts/' + ACCOUNT + '/r2/buckets');
if (!buckets.ok) {
	explain(buckets.body.errors);
	process.exit(1);
}

const have = (buckets.body.result?.buckets || []).some((b) => b.name === BUCKET);
if (have) {
	console.log('Bucket already exists: ' + BUCKET);
} else {
	const made = await call('/accounts/' + ACCOUNT + '/r2/buckets', {
		method: 'POST',
		body: JSON.stringify({ name: BUCKET, locationHint: LOCATION })
	});
	if (!made.ok) {
		explain(made.body.errors);
		process.exit(1);
	}
	console.log('Created bucket: ' + BUCKET + ' (' + LOCATION + ')');
}

const cfg = readFileSync(cfgPath, 'utf8');
if (cfg.includes('"r2_buckets"')) {
	console.log('wrangler.jsonc already binds a bucket.');
} else {
	const at = cfg.indexOf('"routes"');
	if (at < 0) {
		console.error('Could not find "routes" in wrangler.jsonc - add the binding by hand.');
		process.exit(1);
	}
	const binding = '"r2_buckets": [{ "binding": "MEDIA", "bucket_name": "' + BUCKET + '" }],\n\t';
	writeFileSync(cfgPath, cfg.slice(0, at) + binding + cfg.slice(at), 'utf8');
	console.log('Added the MEDIA binding to wrangler.jsonc. Deploy to switch photos to R2.');
}
