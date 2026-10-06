<script lang="ts">
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { withPage, type GlimpsePhoto } from '$lib/immich/strip';
	import { photoAfterKey } from '$lib/ui/photo-walk';
	import { tick } from 'svelte';
	import { fetchGlimpse } from './immich-glimpse';
	import ImmichPhotoViewer from './ImmichPhotoViewer.svelte';

	/*
	 * A glimpse of a linked person's photos in Immich (docs/concepts/immich.md §4.3, §4.5): one
	 * horizontal strip of their latest twelve, newest first, and *Show more* for the next twelve —
	 * not a gallery. It is asked for after the page has loaded, so a slow Immich never holds the
	 * page up, and every picture comes through Stella's signed proxy. A tap opens the photo in the
	 * lightbox at Immich's preview size.
	 *
	 * With `together`, the same strip holds the photos the person is in with someone else (docs/02
	 * §2.24.8); the viewer, *Use as photo* and *Open in Immich* work on them as on any other.
	 *
	 * Quiet on failure: the line above it already says when Immich did not answer or no longer has
	 * the person, so the strip then simply is not there. Never shown offline — the Photos card
	 * leaves it out — and nothing it shows is kept on the device.
	 */
	interface Props {
		contactId: string;
		/** The person's name as the page shows it, for the pictures' descriptions. */
		name: string;
		/** Whether the person wears a photo now, for *Use as photo* in the viewer. */
		hasPhoto: boolean;
		/**
		 * The other person, for the photos of the two together (docs/02 §2.24.8), with what the
		 * strip is then called; null for the person's own photos.
		 */
		together?: { contactId: string; label: string } | null;
	}
	let { contactId, name, hasPhoto, together = null }: Props = $props();
	// A primitive, so the strip asks again only when the pair changes, not when its label is rebuilt.
	const togetherWith = $derived(together?.contactId ?? null);

	const i18n = useI18n();
	const t = i18n.t;

	/** Tiles shown while the first page is on its way, so the card does not jump when it lands. */
	const PLACEHOLDER_TILES = 6;

	let photos = $state<GlimpsePhoto[]>([]);
	let nextCursor = $state<string | null>(null);
	/** `loading` until the first page answers; `none` when there is nothing to show. */
	let phase = $state<'loading' | 'shown' | 'none' | 'noneTogether'>('loading');
	let loadingMore = $state(false);
	let opened = $state<number | null>(null);
	const openedPhoto = $derived(opened === null ? null : (photos[opened] ?? null));
	// The strip's buttons, so closing the viewer hands focus back to the photo now showing.
	const tiles: HTMLButtonElement[] = $state([]);

	$effect(() => {
		// Asked again for whoever the page shows now, and whichever pair; an answer for the one
		// before is dropped.
		const asked = { contactId, togetherWith };
		let current = true;
		phase = 'loading';
		photos = [];
		nextCursor = null;
		opened = null;
		void fetchGlimpse(asked.contactId, null, asked.togetherWith).then((page) => {
			if (!current) return;
			if (page?.state === 'photos' && page.photos.length > 0) {
				photos = page.photos;
				nextCursor = page.nextCursor;
				phase = 'shown';
			} else {
				// Two people with no photo together are said so; anything else the line above says.
				phase = asked.togetherWith !== null && page?.state === 'photos' ? 'noneTogether' : 'none';
			}
		});
		return () => {
			current = false;
		};
	});

	async function showMore() {
		if (nextCursor === null || loadingMore) return;
		loadingMore = true;
		const asked = { contactId, togetherWith };
		const page = await fetchGlimpse(asked.contactId, nextCursor, asked.togetherWith);
		loadingMore = false;
		if (asked.contactId !== contactId || asked.togetherWith !== togetherWith) return;
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

{#if phase === 'noneTogether'}
	<p class="mt-2 text-sm text-fg-subtle" data-testid="immich-strip" data-phase={phase}>
		{t('immich.together.none')}
	</p>
{:else if phase !== 'none'}
	<div class="mt-2" data-testid="immich-strip" data-phase={phase}>
		{#if phase === 'loading'}
			<span class="sr-only" role="status">{t('immich.strip.loading')}</span>
			<ul class="flex gap-2 overflow-hidden pb-1" aria-hidden="true">
				{#each Array.from({ length: PLACEHOLDER_TILES }, (_, index) => index) as index (index)}
					<li class="size-20 shrink-0 rounded-control bg-bg-sunken"></li>
				{/each}
			</ul>
		{:else}
			<ul
				class="flex gap-2 overflow-x-auto pb-1"
				aria-label={together?.label ?? t('immich.strip.label')}
			>
				{#each photos as photo, index (photo.id)}
					<li class="shrink-0">
						<button
							type="button"
							bind:this={tiles[index]}
							onclick={() => (opened = index)}
							class={TILE}
						>
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
		{contactId}
		{hasPhoto}
		onclose={close}
		onstep={step}
		onkeydown={(event) => step(event.key)}
	/>
{/if}
