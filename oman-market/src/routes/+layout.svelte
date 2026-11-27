<script lang="ts">
	import type { Snippet } from 'svelte';
	import '../app.css';
	import { SITE } from '#lib/market';

	let { children }: { children: Snippet } = $props();

	let menuOpen = $state(false);
	let menuEl = $state<HTMLElement | null>(null);
	const close = () => (menuOpen = false);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') menuOpen = false;
	}

	function onDocClick(e: MouseEvent) {
		if (menuOpen && menuEl && !menuEl.contains(e.target as Node)) menuOpen = false;
	}
</script>

<svelte:window onkeydown={onKey} onclick={onDocClick} />

<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="/">
			<span class="mark">OSM</span>
			<span class="brand-name">{SITE.name}</span>
		</a>

		<form class="header-search" action="/search" method="get" role="search">
			<input
				type="search"
				name="q"
				placeholder="Search material, town or grade…"
				aria-label="Search listings"
				autocomplete="off"
			/>
			<button type="submit" aria-label="Search">Search</button>
		</form>

		<a class="btn btn-primary header-post" href="/post">Post a listing</a>

		<div class="menu" bind:this={menuEl}>
			<button
				class="menu-btn"
				type="button"
				aria-label={menuOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={menuOpen}
				aria-controls="site-menu"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span></span><span></span><span></span>
			</button>

			{#if menuOpen}
				<nav id="site-menu" class="menu-panel" aria-label="Main">
					<a href="/" onclick={close}>Latest</a>
					<a href="/materials" onclick={close}>Materials</a>
					<a href="/search" onclick={close}>Search</a>
				</nav>
			{/if}
		</div>
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
			<a href="https://wa.me/{SITE.whatsapp}" rel="noopener">WhatsApp</a><br />
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
