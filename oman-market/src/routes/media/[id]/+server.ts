import { getMedia } from '#lib/store';
import { getBindings } from '#lib/bindings.server';

export async function GET({ params, setHeaders }) {
	const media = await getMedia(await getBindings(), params.id);
	if (!media) return new Response('Not found', { status: 404 });
	setHeaders({
		'content-type': media.type,
		'cache-control': 'public, max-age=31536000, immutable'
	});
	return new Response(media.bytes);
}
