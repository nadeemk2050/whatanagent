<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import { SITE } from '#lib/market';

	let { children }: { children: Snippet } = $props();
</script>

<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="/">
			<span class="mark">OSM</span>
			<span>
				{SITE.name}
				<small>Plastic &amp; metal scrap · Oman</small>
			</span>
		</a>
		<nav class="nav" aria-label="Main">
			<a href="/">Latest</a>
			<a href="/materials">Materials</a>
			<a href="/search">Search</a>
			<a href={SITE.main} rel="noopener">Arabian Polyplast ↗</a>
		</nav>
	</div>
</header>

<main>
	{@render children()}
</main>

<footer class="site-footer">
	<div class="wrap footer-grid">
		<div>
			<strong>{SITE.legal}</strong><br />
			{SITE.address}<br />
			{SITE.hours} · Friday closed
		</div>
		<div>
			<strong>Contact</strong><br />
			<a href="tel:{SITE.phoneRaw}">{SITE.phone}</a><br />
			<a href="https://wa.me/{SITE.whatsapp}" rel="noopener">WhatsApp {SITE.phone}</a><br />
			<a href="mailto:{SITE.email}">{SITE.email}</a>
		</div>
		<div>
			<strong>More</strong><br />
			<a href={SITE.main} rel="noopener">arabianpolyplast.com</a><br />
			<a href={SITE.main + '/products/'} rel="noopener">Material guides</a><br />
			<span class="muted small">CR {SITE.cr} · TIN {SITE.tin}</span>
		</div>
	</div>
</footer>
