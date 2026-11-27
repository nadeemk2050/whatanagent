<script lang="ts">
	import { priceLabel, materialName, type Listing } from '#lib/market';

	let { listing }: { listing: Listing } = $props();
</script>

<a class="card listing-card" href="/listing/{listing.slug}">
	<div class="chips">
		<li class={listing.type === 'wanted' ? 'chip-wanted' : 'chip-offer'}>
			{listing.type === 'wanted' ? 'Wanted' : 'For sale'}
		</li>
		<li>{materialName(listing.material)}</li>
		<li>{listing.city}</li>
	</div>
	<h3>{listing.title}</h3>
	<p class="muted small" style="margin:0">{listing.summary}</p>
	<p class="small" style="margin:0">
		<span class="price">{priceLabel(listing)}</span>
		<span class="muted"> · {listing.quantity}</span>
	</p>
</a>
