import { SITE } from '#lib/market';

const AI_BOTS = [
	'GPTBot',
	'OAI-SearchBot',
	'ChatGPT-User',
	'ClaudeBot',
	'Claude-SearchBot',
	'PerplexityBot',
	'Google-Extended',
	'Applebot-Extended',
	'Bingbot',
	'CCBot',
	'meta-externalagent'
];

export function GET() {
	const body =
		'# Oman Scrap Market — everything is public and intended to be crawled.\n' +
		'User-agent: *\nAllow: /\nDisallow: /search\n\n' +
		AI_BOTS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join('\n') +
		`\nSitemap: ${SITE.base}/sitemap.xml\n`;
	return new Response(body, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'max-age=3600' }
	});
}
