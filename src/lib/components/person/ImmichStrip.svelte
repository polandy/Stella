<script lang="ts">
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { withPage, type GlimpsePhoto, type ImmichGlimpse } from '$lib/immich/strip';
	import { photoAfterKey } from '$lib/ui/photo-walk';
	import { tick } from 'svelte';
	import ImmichPhotoViewer from './ImmichPhotoViewer.svelte';

	/*
	 * A glimpse of a linked person's photos in Immich (docs/concepts/immich.md §4.3, §4.5): one
	 * horizontal strip of their latest twelve, newest first, and *Show more* for the next twelve —
	 * not a gallery. It is asked for after the page has loaded, so a slow Immich never holds the
	 * page up, and every picture comes through Stella's signed proxy. A tap opens the photo in the
	 * lightbox at Immich's preview size.
	 *
	 * Quiet on failure: the line above it already says when Immich did not answer or no longer has
	 * the person, so the strip then simply is not there. Never shown offline — the Photos card
	 * leaves it out — and nothing it shows is kept on the device.
	 */
	interface Props {
		contactId: string;
		/** The person's name as the page shows it, for the pictures' descriptions. */
		name: string;
	}
	let { contactId, name }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	/** Tiles shown while the first page is on its way, so the card does not jump when it lands. */
	const PLACEHOLDER_TILES = 6;

	let photos = $state<GlimpsePhoto[]>([]);
	let nextCursor = $state<string | null>(null);
	/** `loading` until the first page answers; `none` when there is nothing to show. */
	let phase = $state<'loading' | 'shown' | 'none'>('loading');
	let loadingMore = $state(false);
	let opened = $state<number | null>(null);
	const openedPhoto = $derived(opened === null ? null : (photos[opened] ?? null));
	// The strip's buttons, so closing the viewer hands focus back to the photo now showing.
	const tiles: HTMLButtonElement[] = $state([]);

	/** One page of the strip; null when it could not be had, which the strip takes quietly (above). */
	async function fetchPage(cursor: string | null): Promise<ImmichGlimpse | null> {
		const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`;
		try {
			const response = await fetch(`/contacts/${encodeURIComponent(contactId)}/immich/photos${query}`);
			return response.ok ? ((await response.json()) as ImmichGlimpse) : null;
		} catch {
			// The network went away mid-request: the card is about to say Stella is offline.
			return null;
		}
	}

	$effect(() => {
		// Asked again for whoever the page shows now; an answer for the person before is dropped.
		void contactId;
		let current = true;
		phase = 'loading';
		photos = [];
		nextCursor = null;
		opened = null;
		void fetchPage(null).then((page) => {
			if (!current) return;
			if (page?.state === 'photos' && page.photos.length > 0) {
				photos = page.photos;
				nextCursor = page.nextCursor;
				phase = 'shown';
			} else {
				phase = 'none';
			}
		});
		return () => {
			current = false;
		};
	});

	async function showMore() {
		if (nextCursor === null || loadingMore) return;
		loadingMore = true;
		const asked = contactId;
		const page = await fetchPage(nextCursor);
		loadingMore = false;
		if (asked !== contactId) return;
		if (page?.state === 'photos') {
			photos = withPage(photos, page.photos);
			nextCursor = page.nextCursor;
		} else {
			// Immich stopped answering between pages: what is shown stays, the button goes.
			nextCursor = null;
		}
	}

	function step(key: string) {
		if (opened === null) return;
		const next = photoAfterKey({ key, at: opened, count: photos.length, typing: false });
		if (next !== null) opened = next;
	}

	function close() {
		const at = opened;
		opened = null;
		// After the dialog has gone: until then the strip is inert and cannot take focus.
		if (at !== null) void tick().then(() => tiles[at]?.focus());
	}

	const describe = (photo: GlimpsePhoto) =>
		photo.takenOn === null
			? t('contact.photos.of', { name })
			: t('immich.strip.photo', { date: dayLabel(i18n, photo.takenOn) });

	const TILE =
		'flex size-20 shrink-0 overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
</script>

{#if phase !== 'none'}
	<div class="mt-2" data-testid="immich-strip" data-phase={phase}>
		{#if phase === 'loading'}
			<span class="sr-only" role="status">{t('immich.strip.loading')}</span>
			<ul class="flex gap-2 overflow-hidden pb-1" aria-hidden="true">
				{#each Array.from({ length: PLACEHOLDER_TILES }, (_, index) => index) as index (index)}
					<li class="size-20 shrink-0 rounded-control bg-bg-sunken"></li>
				{/each}
			</ul>
		{:else}
			<ul class="flex gap-2 overflow-x-auto pb-1" aria-label={t('immich.strip.label')}>
				{#each photos as photo, index (photo.id)}
					<li class="shrink-0">
						<button type="button" bind:this={tiles[index]} onclick={() => (opened = index)} class={TILE}>
							<img
								src={photo.thumbnailUrl}
								alt={describe(photo)}
								class="size-full bg-bg-sunken object-cover"
								loading="lazy"
							/>
						</button>
					</li>
				{/each}
				{#if nextCursor !== null}
					<li class="shrink-0">
						<button
							type="button"
							onclick={showMore}
							disabled={loadingMore}
							aria-busy={loadingMore}
							class="{TILE} items-center justify-center border border-border-subtle px-1 text-center text-xs font-medium text-link hover:bg-bg-sunken disabled:opacity-60"
							data-testid="immich-show-more"
						>
							{t('immich.strip.showMore')}
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	</div>
{/if}

{#if openedPhoto && opened !== null}
	<ImmichPhotoViewer
		photo={openedPhoto}
		at={opened}
		count={photos.length}
		{name}
		onclose={close}
		onstep={step}
		onkeydown={(event) => step(event.key)}
	/>
{/if}
