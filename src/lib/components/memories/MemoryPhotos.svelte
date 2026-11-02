<script lang="ts">
	import { tick } from 'svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ImmichMemoryPhoto } from '$lib/immich/on-this-day';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { MemoryPhotoView } from '$lib/memories/view';
	import ImmichMemoryLightbox from './ImmichMemoryLightbox.svelte';

	/*
	 * The day's photos in earlier years (docs/02 §2.12.1): square thumbnails, the gallery's first,
	 * each opening the person's Photos card — a private one stays blurred (§2.10.1) — then Immich's,
	 * pilled *Immich*, each opening the lightbox. Grey tiles hold Immich's place while it is asked.
	 * Home's band is one row with each photo's year; a year card on the page runs wider.
	 */
	interface Props {
		photos: MemoryPhotoView[];
		immich?: readonly ImmichMemoryPhoto[];
		/** Grey tiles to hold the place of photos still on their way. */
		holds?: number;
		/** Each tile's year: on Home's band, which mixes the years. */
		years?: boolean;
	}
	let { photos, immich = [], holds = 0, years = true }: Props = $props();

	const t = useI18n().t;
	let open = $state<number | null>(null);
	const tiles: HTMLButtonElement[] = $state([]);

	function close() {
		const at = open;
		open = null;
		// After the dialog has gone: until then the band is inert and cannot take focus.
		if (at !== null) void tick().then(() => tiles[at]?.focus());
	}

	const TILE = 'relative aspect-square max-w-full overflow-hidden rounded-app bg-card';
	const YEAR =
		'pointer-events-none absolute bottom-0.5 left-0.5 rounded-sm bg-bg/80 px-1 text-[10px] font-medium text-fg tabular-nums';
</script>

<ul class="grid grid-cols-4 gap-1.5 {years ? '' : 'sm:grid-cols-6'}" data-testid="memory-photos">
	{#each photos as photo (photo.id)}
		<li class={TILE}>
			<a
				href={photo.href}
				class="block h-full w-full"
				aria-label={t('memories.photoOf', { name: photo.person.name, year: photo.year })}
			>
				<Veil
					id="photo:{photo.id}"
					isPrivate={photo.isPrivate}
					label={t('privacy.veil.photo')}
					photo
					compact
					passive
					class="h-full w-full"
				>
					<img
						src={thumbnailUrl(photo.id)}
						alt=""
						loading="lazy"
						class="h-full w-full object-cover"
					/>
				</Veil>
				{#if years}<span class={YEAR}>{photo.year}</span>{/if}
			</a>
		</li>
	{/each}
	{#each immich as photo, at (photo.id)}
		<li class={TILE} data-testid="memory-immich-photo">
			<button
				type="button"
				bind:this={tiles[at]}
				onclick={() => (open = at)}
				class="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				aria-label={t('memories.immich.photo', { year: photo.year })}
			>
				<img
					src={photo.thumbnailUrl}
					alt=""
					loading="lazy"
					class="h-full w-full bg-bg-sunken object-cover"
				/>
				<span
					class="pointer-events-none absolute top-0.5 right-0.5 rounded-full bg-bg/80 px-1.5 py-px text-[9px] font-semibold text-fg-muted"
					data-testid="photo-immich-badge"
					aria-hidden="true">{t('contact.photos.sourceImmich')}</span
				>
				{#if years}<span class={YEAR}>{photo.year}</span>{/if}
			</button>
		</li>
	{/each}
	{#each { length: holds }, n (n)}
		<li
			class="aspect-square rounded-app bg-bg-sunken motion-safe:animate-pulse"
			aria-hidden="true"
		></li>
	{/each}
</ul>

{#if open !== null}
	<ImmichMemoryLightbox photos={immich} at={open} onwalk={(at) => (open = at)} onclose={close} />
{/if}
