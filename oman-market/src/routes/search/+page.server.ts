export function load({ url }: { url: URL }) {
	const q = (url.searchParams.get('q') || '').slice(0, 120);
	return { q };
}
