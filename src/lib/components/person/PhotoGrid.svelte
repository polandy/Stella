<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { glanceTiles, photoKey } from '$lib/contacts/photo-card';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { photoDay } from '$lib/image/taken-at';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { CardEntry } from './types';

	/*
	 * The Photos card's grid (docs/design/screens/person.md): square tiles, three to a row on a
	 * phone and seven from `sm`, never a strip that scrolls sideways. As a *glance* it is one row
	 * on a wide card and two on a phone, its last tile *All 1,769 photos* once there are more;
	 * otherwise it holds the whole list and grows downward.
	 */
	interface Props {
		entries: readonly CardEntry[];
		/** Which list this is, for whoever reads the page: `all`, `stella` or `immich`. */
		view: string;
		/** The person whose photos they are, for the pictures' descriptions. */
		name: string;
		/** As a glance, with how many photos there are in all; omitted for the whole list. */
		glance?: { total: number; onall: () => void } | null;
		/**
		 * Tiles held empty while the list is on its way, at each width, so the card does not jump
		 * when it lands; none once it is there.
		 */
		placeholders?: { wide: number; narrow: number } | null;
		/** Whether a tile says where it lives — only where both sources are mixed. */
		badges?: boolean;
		/** What the list is, for a screen reader. */
		label: string;
		onopen: (at: number) => void;
	}
	let {
		entries,
		view,
		name,
		glance = null,
		placeholders = null,
		badges = false,
		label,
		onopen
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	const tiles = $derived(glance === null ? null : glanceTiles(glance.total));
	const shown = $derived(tiles === null ? entries : entries.slice(0, tiles.wide));
	/** A tile past the phone's share of the glance waits for a wider card. */
	const narrowHidden = (at: number) => tiles !== null && at >= tiles.narrow;
	const moreTileClass = $derived(
		tiles === null ? '' : !tiles.moreWide ? 'sm:hidden' : !tiles.moreNarrow ? 'max-sm:hidden' : ''
	);
	const total = $derived(
		glance === null ? '' : new Intl.NumberFormat(i18n.intlLocale).format(glance.total)
	);

	const dayOf = (entry: CardEntry): string | null =>
		entry.source === 'stella'
			? dayLabel(i18n, photoDay(entry.photo))
			: entry.photo.takenOn === null
				? null
				: dayLabel(i18n, entry.photo.takenOn);

	function describe(entry: CardEntry): string {
		if (entry.source === 'stella') return entry.photo.caption ?? t('contact.photos.of', { name });
		return entry.photo.takenOn === null
			? t('contact.photos.of', { name })
			: t('immich.strip.photo', { date: dayLabel(i18n, entry.photo.takenOn) });
	}

	const GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-7';
	const BADGE = 'pointer-events-none absolute rounded-full bg-bg/80 p-1';
</script>

{#if placeholders !== null}
	<span class="sr-only" role="status">{t('immich.strip.loading')}</span>
	<ul class={GRID} aria-hidden="true" data-testid="photo-placeholders">
		{#each Array.from({ length: placeholders.wide }, (_, index) => index) as index (index)}
			<li
				class="aspect-square rounded-control bg-bg-sunken {index >= placeholders.narrow
					? 'max-sm:hidden'
					: ''}"
			></li>
		{/each}
	</ul>
{:else}
	<ul class={GRID} aria-label={label} data-testid="photo-grid" data-view={view}>
		{#each shown as entry, index (photoKey(entry))}
			{@const day = dayOf(entry)}
			<li class="relative {narrowHidden(index) ? 'max-sm:hidden' : ''}" data-source={entry.source}>
				<button
					type="button"
					onclick={() => onopen(index)}
					data-photo-key={photoKey(entry)}
					class="relative block w-full overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				>
					<img
						src={entry.source === 'stella'
							? thumbnailUrl(entry.photo.id)
							: entry.photo.thumbnailUrl}
						alt={describe(entry)}
						class="aspect-square w-full bg-bg-sunken object-cover"
						loading="lazy"
					/>
					{#if entry.source === 'stella' && entry.photo.pinnedAt !== null}
						<!-- A star, not a tint: the pin reads without colour (docs/05 §5.10). -->
						<span class="{BADGE} top-1 left-1 text-primary" data-testid="photo-favourite">
							<Icon name="pinned" size={11} />
						</span>
						<span class="sr-only">{t('contact.photos.favourite')}</span>
					{/if}
					{#if entry.source === 'immich' && badges}
						<span
							class="pointer-events-none absolute top-1 right-1 rounded-full bg-bg/80 px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-muted"
							data-testid="photo-immich-badge"
						>
							{t('contact.photos.sourceImmich')}
						</span>
					{/if}
					{#if day !== null}
						<span
							class="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/65 to-transparent px-1.5 pt-3 pb-1 text-left text-[0.6875rem] font-medium text-white"
							aria-hidden="true"
						>
							{day}
						</span>
					{/if}
				</button>
				{#if entry.source === 'stella' && entry.photo.visibility === 'private'}
					<span class="{BADGE} top-1 right-1 text-fg-muted" title={t('contact.photos.privateHint')}>
						<Icon name="private" size={11} />
					</span>
				{/if}
			</li>
		{/each}
		{#if glance !== null && tiles !== null && (tiles.moreWide || tiles.moreNarrow)}
			<li class={moreTileClass}>
				<button
					type="button"
					onclick={glance.onall}
					class="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-control border border-border-subtle bg-bg-sunken px-1 text-center text-xs font-medium text-link hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					data-testid="photo-all-tile"
				>
					<Icon name="photo" size={16} />
					{t('contact.photos.allCount', { count: glance.total, shown: total })}
				</button>
			</li>
		{/if}
	</ul>
{/if}
