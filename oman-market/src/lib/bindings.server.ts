// Cloudflare bindings.
//
// SvelteKit 3 no longer passes `platform` to init(), so the adapter's own generated
// worker imports `env` from `cloudflare:workers` — the app does the same. The import
// is dynamic and wrapped: on the Node build (npm test) the module does not exist, the
// import throws, and the market simply runs on the seed catalogue.
import type { KV } from './store';

let cached: { MARKET?: KV } | null = null;

export async function getBindings(): Promise<{ MARKET?: KV }> {
	if (cached) return cached;
	let env: { MARKET?: KV } = {};
	try {
		const mod = (await import(/* @vite-ignore */ 'cloudflare:workers')) as { env?: { MARKET?: KV } };
		env = mod.env || {};
	} catch {
		env = {};
	}
	cached = env;
	return env;
}
