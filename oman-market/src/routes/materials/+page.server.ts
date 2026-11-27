import { liveMaterials } from '#lib/market';

export function load() {
	return { materials: liveMaterials() };
}
