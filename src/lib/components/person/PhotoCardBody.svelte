<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { GLANCE_TILES, photoKey, type PhotoTab } from '$lib/people/photo-card';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { StripView } from '$lib/immich/together';
	import { tick } from 'svelte';
	import type { PhotoCardState, PhotoView } from './photo-card-state.svelte';
	import PhotoGrid from './PhotoGrid.svelte';
	import PhotoLightbox from './PhotoLightbox.svelte';
	import TogetherChips from './TogetherChips.svelte';
	import type { CardEntry, PersonPageData } from './types';

	/*
	 * The Photos card's photos (docs/design/screens/person.md): the tab's grid, *Show more* under
	 * Immich's, and the one lightbox, which walks the list its tile was opened from.
	 */
	interface Props {
		data: PersonPageData;
		card: PhotoCardState;
		view: PhotoView;
		/** The id the tabs name as the panel they control. */
		panel: string;
	}
	let { data, card, view = $bindable(), panel }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/** Tiles held while a page of Immich photos is on its way: one page, at every width. */
	const IMMICH_PAGE = { wide: 12, narrow: 12 };

	const ownFirstName = $derived(c.firstName || c.displayName);
	const firstNameOf = (contactId: string) => {
		const person = data.people.find((candidate) => candidate.id === contactId);
		return person?.firstName || person?.displayName || '';
	};
	/** Whether the pair is the viewer and someone, said *you* rather than by name. */
	const withViewer = (pair: StripView & { contactId: string }) =>
		pair.kind === 'withYou' || c.id === data.user.selfContactId;
	/** The other one of a pair: the page's person, when the page is the viewer's own. */
	const otherOf = (pair: StripView & { contactId: string }) =>
		pair.kind === 'withYou' ? ownFirstName : firstNameOf(pair.contactId);
	const immichLabel = $derived.by(() => {
		const shown = card.shownView;
		if (shown.kind === 'own') return t('immich.strip.label');
		return withViewer(shown)
			? t('immich.together.stripWithYou', { name: otherOf(shown) })
			: t('immich.together.stripPair', { first: ownFirstName, second: otherOf(shown) });
	});
	const chooseView = (pair: StripView) => {
		view = { ...view, shown: pair.kind === 'own' ? null : pair.contactId };
	};

	/** The photo open, by the tab whose list it walks; the list is read live, so *Show more* extends it. */
	let opened = $state<{ tab: PhotoTab; at: number } | null>(null);
	const openedList = $derived<readonly CardEntry[]>(opened ? card.entries(opened.tab) : []);
	let grid: HTMLDivElement | undefined = $state();

	function close() {
		const entry = opened ? openedList[opened.at] : undefined;
		opened = null;
		// After the dialog has gone: until then the card is inert and cannot take focus. The tile
		// of the photo now showing, or — outside *All*'s first row — the tile *All* ends on.
		void tick().then(() => {
			const key = entry ? photoKey(entry) : null;
			const tile =
				(key && grid?.querySelector<HTMLElement>(`[data-photo-key="${CSS.escape(key)}"]`)) ||
				grid?.querySelector<HTMLElement>('[data-testid="photo-all-tile"]');
			tile?.focus();
		});
	}

	/*
	 * *All 1,769 photos* opens *All* out in place. The tile goes, so the cursor moves to the photo
	 * that takes its place rather than falling off the page.
	 */
	function openAll() {
		const tiles = () => [...(grid?.querySelectorAll<HTMLElement>('[data-photo-key]') ?? [])];
		const before = tiles().filter((tile) => tile.offsetParent !== null).length;
		view = { ...view, expanded: true };
		void tick().then(() => tiles()[before]?.focus());
	}

	const showMore = $derived(card.tab === 'immich' || (card.tab === 'all' && view.expanded));
	const more = $derived(card.tab === 'immich' ? card.immich : card.own);
</script>

<div
	bind:this={grid}
	id={panel}
	role="tabpanel"
	aria-labelledby="photo-tab-{card.tab}"
	data-immich-phase={card.linked ? card.immich.phase : undefined}
>
	{#if card.tab === 'immich'}
		{#if card.views.length > 1}
			<TogetherChips
				views={card.views}
				shown={card.shownView}
				ownName={ownFirstName}
				{withViewer}
				{otherOf}
				onchoose={chooseView}
			/>
		{/if}
		{#if card.immich.phase === 'noneTogether'}
			<p class="text-sm text-fg-subtle" data-testid="immich-none-together">
				{t('immich.together.none')}
			</p>
		{:else if card.immich.phase === 'loading' || card.immich.photos.length > 0}
			<PhotoGrid
				entries={card.immichEntries}
				view="immich"
				name={c.displayName}
				label={immichLabel}
				placeholders={card.immich.phase === 'loading' ? IMMICH_PAGE : null}
				onopen={(at) => (opened = { tab: 'immich', at })}
			/>
		{/if}
	{:else if card.tab === 'stella'}
		{#if card.stella.length > 0}
			<PhotoGrid
				entries={card.stella}
				view="stella"
				name={c.displayName}
				label={t('contact.photos.tabStella')}
				onopen={(at) => (opened = { tab: 'stella', at })}
			/>
		{:else}
			<p class="text-sm text-fg-subtle">{t('contact.photos.noneInStella')}</p>
		{/if}
	{:else if card.allLoading || card.mixed.length > 0}
		<PhotoGrid
			entries={card.mixed}
			view="all"
			name={c.displayName}
			label={t('contact.photos.tabAll')}
			badges={card.linked}
			placeholders={card.allLoading ? GLANCE_TILES : null}
			glance={view.expanded ? null : { total: card.total, onall: openAll }}
			onopen={(at) => (opened = { tab: 'all', at })}
		/>
	{/if}

	{#if showMore && more.nextCursor !== null && more.phase === 'shown'}
		<div class="mt-3 flex justify-center">
			<Button
				variant="secondary"
				size="sm"
				onclick={() => void more.showMore()}
				disabled={more.loadingMore}
				aria-busy={more.loadingMore}
				data-testid="immich-show-more"
			>
				{t('immich.strip.showMore')}
			</Button>
		</div>
	{/if}
</div>

{#if opened}
	<PhotoLightbox
		{data}
		photos={openedList}
		at={opened.at}
		onwalk={(at) => opened && (opened = { ...opened, at })}
		onclose={close}
	/>
{/if}
