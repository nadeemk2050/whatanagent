<script lang="ts">
	import { goto } from '$app/navigation';
	import { materials, SITE } from '#lib/market';
	import { MAX_PHOTOS } from '#lib/store';

	let type = $state('offer');
	let title = $state('');
	let material = $state('');
	let quantityMt = $state('');
	let packing = $state('');
	let city = $state('');
	let description = $state('');
	let contactName = $state('');
	let whatsapp = $state('');
	let hp = $state('');
	let photos = $state<{ dataUrl: string; w: number; h: number }[]>([]);
	let busy = $state(false);
	let error = $state('');

	const chars = $derived(description.trim().length);

	async function shrink(file: File) {
		const bitmap = await createImageBitmap(file);
		const max = 1200;
		const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
		const w = Math.round(bitmap.width * scale);
		const h = Math.round(bitmap.height * scale);
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('canvas');
		ctx.drawImage(bitmap, 0, 0, w, h);
		return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), w, h };
	}

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);
		for (const f of files) {
			if (photos.length >= MAX_PHOTOS) break;
			if (!/^image\//.test(f.type)) continue;
			try {
				photos = [...photos, await shrink(f)];
			} catch {
				/* unreadable file — skip */
			}
		}
		input.value = '';
	}

	function removePhoto(i: number) {
		photos = photos.filter((_, idx) => idx !== i);
	}

	async function submit(e: Event) {
		e.preventDefault();
		if (busy) return;
		error = '';
		busy = true;
		try {
			const res = await fetch('/api/listings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type,
					title,
					material,
					quantityMt,
					packing,
					city,
					description,
					contactName,
					whatsapp,
					hp,
					photos
				})
			});
			const d = await res.json();
			if (!d.ok) {
				error = d.error || 'Could not publish the listing.';
				return;
			}
			await goto('/listing/' + d.slug);
		} catch (err) {
			error = (err as Error).message || 'Could not publish the listing.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Post a scrap listing | Oman Scrap Market</title>
	<meta name="description" content="Post plastic or metal scrap you want to sell or buy in Oman. Free, up to 5 photos, live straight away." />
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<section class="hero">
	<div class="wrap">
		<p class="eyebrow">Post a listing</p>
		<h1>Sell it here — free, 5 photos, live in a minute</h1>
		<p class="lead">
			Anyone can post. Buyers see exactly what you have because the listing asks for the quantity, the
			packing and the town. Listings stay up for 60 days.
		</p>
	</div>
</section>

<section class="section">
	<div class="wrap" style="max-width:820px">
		<form class="card post-form" onsubmit={submit}>
			<div class="chips" style="margin-bottom:16px">
				<li>
					<label style="cursor:pointer">
						<input type="radio" bind:group={type} value="offer" /> I have scrap for sale
					</label>
				</li>
				<li>
					<label style="cursor:pointer">
						<input type="radio" bind:group={type} value="wanted" /> I want to buy scrap
					</label>
				</li>
			</div>

			<label class="field">Title
				<input bind:value={title} maxlength="90" placeholder="e.g. Baled clear PET bottles — 24 tonnes in Barka" required />
			</label>

			<div class="row2">
				<label class="field">Material
					<select bind:value={material} required>
						<option value="">Choose…</option>
						{#each materials() as m (m.slug)}
							<option value={m.slug}>{m.name}</option>
						{/each}
					</select>
				</label>
				<label class="field">Quantity in metric tonnes (MT)
					<div class="mt-wrap">
						<input
							bind:value={quantityMt}
							type="number"
							inputmode="decimal"
							min="0.5"
							step="0.5"
							placeholder="e.g. 24"
							required
						/>
						<span class="mt-unit">MT</span>
					</div>
				</label>
			</div>

			<div class="row2">
				<label class="field">Packing
					<input bind:value={packing} placeholder="Baled · big bags · loose · regrind" />
				</label>
				<label class="field">Where is it
					<input bind:value={city} placeholder="Barka, Muscat, Sohar…" required />
				</label>
			</div>

			<label class="field">Describe the lot
				<textarea
					bind:value={description}
					rows="7"
					maxlength="20000"
					placeholder="Grade and colour, contamination, how it is stored, terms, who to ask for…"
				></textarea>
				<span class="muted small">{chars} characters — write as much or as little as you need</span>
			</label>

			<div class="row2">
				<label class="field">Your name
					<input bind:value={contactName} autocomplete="name" required />
				</label>
				<label class="field">WhatsApp number
					<input bind:value={whatsapp} type="tel" inputmode="tel" placeholder="+968 9xxx xxxx" required />
				</label>
			</div>

			<div class="field">
				Photos — up to {MAX_PHOTOS}
				<input type="file" accept="image/*" multiple onchange={onFiles} />
				{#if photos.length}
					<div class="photo-grid">
						{#each photos as p, i}
							<div class="photo-thumb">
								<img src={p.dataUrl} alt="Photo {i + 1} of the lot" />
								<button type="button" onclick={() => removePhoto(i)} aria-label="Remove photo {i + 1}">×</button>
							</div>
						{/each}
					</div>
				{/if}
				<span class="muted small">Photos are resized in your browser before upload.</span>
			</div>

			<input class="hp" bind:value={hp} tabindex="-1" autocomplete="off" aria-hidden="true" />

			{#if error}
				<p class="notice" style="border-color:#f0c4c0;background:#fdf1f0;color:#8a2c22">{error}</p>
			{/if}

			<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">
				<button class="btn btn-primary" type="submit" disabled={busy}>
					{busy ? 'Publishing…' : 'Publish listing'}
				</button>
				<span class="muted small">Free. Nothing is charged, no account needed.</span>
			</div>
		</form>

		<p class="muted small" style="margin-top:14px">
			Questions? WhatsApp <a href="https://wa.me/{SITE.whatsapp}" rel="noopener">+{SITE.whatsapp}</a>.
		</p>
	</div>
</section>
