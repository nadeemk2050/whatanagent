import { materials } from '#lib/market';
import { mergedLive } from '#lib/store';
import { getBindings } from '#lib/bindings.server';

export async function load() {
	const env = await getBindings();
	const listings = await mergedLive(env);

	const counts = new Map<string, number>();
	for (const l of listings) counts.set((l as any).material, (counts.get((l as any).material) || 0) + 1);

	return {
		listings,
		materials: materials()
			.map((material) => ({ material, count: counts.get(material.slug) || 0 }))
			.filter((m) => m.count > 0),
		total: listings.length
	};
}
