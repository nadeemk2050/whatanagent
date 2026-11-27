import { json } from '@sveltejs/kit';
import { getBindings } from '#lib/bindings.server';

// Small public health endpoint: proves which bindings the worker actually has.
export async function GET() {
	const env = (await getBindings()) as Record<string, unknown>;
	return json({
		ok: true,
		market: 'oman-scrap-market',
		bindings: Object.keys(env).sort(),
		kv: !!env.MARKET
	});
}
