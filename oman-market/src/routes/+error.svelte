<script lang="ts">
	import { SITE } from '#lib/market';

	let { data }: { data: { status: number; message?: string } } = $props();
</script>

<svelte:head>
	<title>{data.status === 404 ? 'Not found' : 'Something went wrong'} | Oman Scrap Market</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="section">
	<div class="wrap">
		<p class="eyebrow">{data.status}</p>
		<h1>{data.status === 404 ? 'That page is not here' : 'Something went wrong'}</h1>
		<p class="muted">
			{#if data.status === 404}
				The listing may have expired or the link is wrong. Live listings are on the
				<a href="/">home page</a>.
			{:else}
				{data.message}
			{/if}
		</p>
		<p><a class="btn btn-outline" href="/">All listings</a></p>
		<p class="small muted">
			{SITE.legal} · <a href="tel:{SITE.phoneRaw}">{SITE.phone}</a>
		</p>
	</div>
</section>
