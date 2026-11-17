<!--
  @component
  *From Immich* (docs/dev/02 §2.24.9, docs/dev/design/screens/immich-library.md): a sheet from the bottom
  that walks the whole library's timeline — all years, a year, a month (with a chip per week), a day — whoever is in the
  photos, and a smart search across it. It opens on one day; the trail leads up from there. Taps tick photos, numbered in order; *Add N photos* copies them through Stella's signed
  proxy and hands them over as files, for the same pipeline as a pick from the device — or, with
  `onlink`, hands the photos themselves over, to be kept as references (docs/dev/04 ADR-132).
-->
<script lang="ts">
	import { FIELD } from '$lib/components/ui/field';
	import { tick } from 'svelte';
	import { deviceDay } from '$lib/dates/today';
	import Button from '$lib/components/ui/Button.svelte';
	import { syncModal } from '$lib/components/ui/modal';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { LibraryPhoto } from '$lib/immich/library';
	import { longDay, monthAndYear, shortDate } from '$lib/immich/library-labels';
	import {
		crumbsOf,
		groupByDay,
		monthsOfYear,
		weeksOfMonth,
		yearTotals,
		type LibraryWeek
	} from '$lib/immich/library-nav';
	import { LIBRARY_PICK_LIMIT, tickTray, toggledTick } from '$lib/immich/library-pick';
	import { copyImmichPhoto, type ImmichCopy } from '$lib/media/copy-immich-photo';
	import { useRemovals } from '$lib/undo/context.svelte';
	import LibraryCrumbs from './library/LibraryCrumbs.svelte';
	import LibraryDayBar from './library/LibraryDayBar.svelte';
	import LibraryFooter from './library/LibraryFooter.svelte';
	import LibraryMonthGrid from './library/LibraryMonthGrid.svelte';
	import LibraryMonths from './library/LibraryMonths.svelte';
	import LibraryNotice from './library/LibraryNotice.svelte';
	import LibraryWeeks from './library/LibraryWeeks.svelte';
	import LibraryPhotos from './library/LibraryPhotos.svelte';
	import LibraryYears from './library/LibraryYears.svelte';
	import { LibraryBrowser } from './library/library-browser.svelte';

	interface Props {
		/** Bindable: set to open the sheet; it clears it when it closes. */
		open?: boolean;
		/** The day the sheet opens on, `YYYY-MM-DD`: the entry's; a gallery has none, so today. */
		day?: string | null;
		/** The ticked photos, copied, in the order they were ticked. The sheet then closes. */
		onadd?: (copies: ImmichCopy[]) => void;
		/** Instead of copies: the ticked photos themselves, in order. The sheet then closes. */
		onlink?: (photos: LibraryPhoto[]) => void;
	}

	let { open = $bindable(false), day = null, onadd, onlink }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const uid = $props.id();
	const titleId = `${uid}-title`;
	let dialog = $state<HTMLDialogElement>();
	let body = $state<HTMLElement>();

	const browser = new LibraryBrowser(async () => {
		await tick();
		body?.scrollTo({ top: 0 });
	});
	let query = $state('');
	let ticked = $state<readonly string[]>([]);
	let copying = $state<{ done: number; count: number } | null>(null);
	let copyError = $state<string | null>(null);

	$effect(() => {
		syncModal(dialog, open, () => {
			ticked = [];
			query = '';
			copyError = null;
			browser.open(day ?? deviceDay());
		});
	});

	// Enter searches — not a form of its own: the sheet may sit inside the upload's form.
	function search(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		browser.search(query.trim());
	}

	function clearSearch() {
		query = '';
		browser.search('');
	}

	async function add() {
		const photos = ticked.flatMap((id) => browser.seen.get(id) ?? []);
		if (onlink) {
			onlink(photos);
			open = false;
			return;
		}
		copying = { done: 0, count: photos.length };
		copyError = null;
		const copies: ImmichCopy[] = [];
		try {
			for (const photo of photos) {
				copies.push(await copyImmichPhoto(photo.previewUrl));
				copying = { done: copies.length, count: photos.length };
			}
		} catch {
			copyError = t('immich.library.copyFailed');
			return;
		} finally {
			copying = null;
		}
		onadd?.(copies);
		removals.notify(t('immich.library.added', { count: copies.length }));
		open = false;
	}

	/** What a tile says: the time in the timeline, the date in a search. */
	function when(photo: LibraryPhoto): string | null {
		if (photo.takenAt === null) return null;
		if (browser.searched === null) return photo.takenAt.slice(11, 16);
		return shortDate(photo.takenAt, i18n.intlLocale);
	}

	const at = $derived(browser.at);
	const view = $derived(browser.view);
	const timeline = $derived(browser.timeline);
	const read = $derived(browser.month);
	const searching = $derived(browser.searched !== null);
	const photos = $derived(view?.state === 'day' || view?.state === 'found' ? view.photos : []);
	const loading = $derived(
		at.level === 'day' || searching
			? view === null
			: at.level === 'month'
				? read === null || (read.loading && read.photos.length === 0)
				: timeline === null
	);
	const full = $derived(ticked.length >= LIBRARY_PICK_LIMIT);
	let weekJumped = $state<{ month: string; week: number } | null>(null);
	const currentWeek = $derived(read && weekJumped?.month === read.month ? weekJumped.week : null);

	async function jumpToWeek(week: LibraryWeek) {
		if (!read) return;
		const month = read.month;
		weekJumped = { month, week: week.week };
		const day = await browser.reach(week);
		if (day === null) return;
		await tick();
		body?.querySelector(`[data-day="${day}"]`)?.scrollIntoView({ block: 'start' });
	}

	const toggle = (id: string) => (ticked = toggledTick(ticked, id));
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclose={() => (open = false)}
	onkeydown={(event) => {
		// Escape closes the sheet only: the form it sits in must not take it as its own Escape.
		if (event.key === 'Escape') event.stopPropagation();
	}}
	onclick={(event) => event.target === event.currentTarget && !copying && dialog?.close()}
	class="mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm md:m-auto md:rounded-app"
	data-testid="immich-library"
>
	<div class="flex h-[85vh] flex-col gap-3 p-4 md:h-[min(85vh,44rem)]">
		<div class="flex items-center justify-between gap-3">
			<h2 id={titleId} class="text-base font-semibold">{t('immich.library.fromImmich')}</h2>
			<Button type="button" variant="ghost" size="sm" onclick={() => dialog?.close()}
				>{t('common.close')}</Button
			>
		</div>

		<div role="search" class="relative">
			<Icon
				name="search"
				size={16}
				class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
			/>
			<input
				type="search"
				bind:value={query}
				placeholder={t('immich.library.search')}
				aria-label={t('immich.library.search')}
				autocomplete="off"
				enterkeyhint="search"
				onkeydown={search}
				class="{FIELD} w-full py-2 pr-3 pl-9"
			/>
		</div>

		{#if browser.searched !== null}
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="truncate text-fg-muted"
					>{t('immich.library.bestMatches', { query: browser.searched })}</span
				>
				<Button type="button" variant="ghost" size="sm" onclick={clearSearch}
					>{t('immich.library.clearSearch')}</Button
				>
			</div>
		{:else if open && (at.level !== 'day' || at.day !== '')}
			<LibraryCrumbs
				crumbs={crumbsOf(at, browser.overview)}
				overview={browser.overview}
				onpick={(level) => browser.go(level)}
			/>
			{#if at.level === 'month' && read && read.photos.length > 0}
				<LibraryWeeks weeks={weeksOfMonth(read.month)} current={currentWeek} onpick={jumpToWeek} />
			{/if}
			{#if at.level === 'day' && view?.state !== 'unreachable'}
				{@const earlier = view?.state === 'day' ? view.earlier : null}
				{@const later = view?.state === 'day' ? view.later : null}
				<LibraryDayBar
					label={longDay(at.day, i18n.intlLocale)}
					count={view?.state === 'day' ? photos.length : null}
					onearlier={earlier ? () => browser.go({ level: 'day', day: earlier }) : null}
					onlater={later ? () => browser.go({ level: 'day', day: later }) : null}
				/>
			{/if}
		{/if}

		<div bind:this={body} class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1" aria-busy={loading}>
			{#if loading}
				<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-hidden="true">
					{#each { length: 12 }, i (i)}
						<li class="aspect-square animate-pulse rounded-control bg-bg-sunken"></li>
					{/each}
				</ul>
			{:else if !searching && (at.level === 'years' || at.level === 'year')}
				{#if timeline?.state !== 'months'}
					<LibraryNotice
						icon="conflict"
						title={t('immich.library.unreachable')}
						hint={t('immich.library.unreachableHint')}
						onretry={() => browser.retry()}
					/>
				{:else if at.level === 'years' && yearTotals(timeline.months).length === 0}
					<LibraryNotice icon="calendar" title={t('immich.library.timelineEmpty')} />
				{:else}
					{#if at.level === 'years'}
						<LibraryYears
							years={yearTotals(timeline.months)}
							onpick={(year) => browser.go({ level: 'year', year })}
						/>
					{:else}
						<LibraryMonths
							year={at.year}
							months={monthsOfYear(timeline.months, at.year)}
							onpick={(month) => browser.go({ level: 'month', month })}
						/>
					{/if}
					<p class="mt-3 text-xs text-fg-subtle">{t('immich.library.countsApproximate')}</p>
				{/if}
			{:else if !searching && at.level === 'month' && read}
				{#if read.failed && read.photos.length === 0}
					<LibraryNotice
						icon="conflict"
						title={t('immich.library.unreachable')}
						hint={t('immich.library.unreachableHint')}
						onretry={() => browser.retry()}
					/>
				{:else if read.photos.length === 0 && read.nextCursor === null}
					<LibraryNotice
						icon="calendar"
						title={t('immich.library.noneInMonth', {
							month: monthAndYear(read.month, i18n.intlLocale)
						})}
					/>
				{:else}
					<LibraryMonthGrid
						days={groupByDay(read.photos)}
						{ticked}
						{full}
						busy={copying !== null}
						labelOf={when}
						ontoggle={toggle}
						onday={(day) => browser.go({ level: 'day', day })}
						nextCursor={read.failed ? null : read.nextCursor}
						loading={read.loading}
						onmore={() => void browser.more()}
						root={body ?? null}
					/>
					{#if read.failed}
						<LibraryNotice
							icon="conflict"
							title={t('immich.library.unreachable')}
							onretry={() => void browser.more()}
						/>
					{/if}
				{/if}
			{:else if view?.state === 'unreachable'}
				<LibraryNotice
					icon="conflict"
					title={t('immich.library.unreachable')}
					hint={t('immich.library.unreachableHint')}
					onretry={() => browser.retry()}
				/>
			{:else if view?.state === 'searchOff'}
				<p
					class="rounded-control bg-bg-sunken p-3 text-sm text-fg-muted"
					data-testid="immich-search-off"
				>
					{t('immich.library.searchOff')}
				</p>
			{:else if view?.state === 'found' && photos.length === 0}
				<LibraryNotice
					icon="calendar"
					title={t('immich.library.noMatch', { query: browser.searched ?? '' })}
				/>
			{:else if view?.state === 'day' && photos.length === 0}
				<LibraryNotice
					icon="calendar"
					title={t('immich.library.noneOnDay', { day: longDay(view.day, i18n.intlLocale) })}
					hint={view.earlier || view.later ? t('immich.library.arrowsSkip') : null}
				/>
			{:else}
				<LibraryPhotos
					{photos}
					{ticked}
					{full}
					busy={copying !== null}
					labelOf={when}
					ontoggle={toggle}
					testid="immich-library-photos"
				/>
			{/if}
		</div>

		<FormError message={copyError} />
		<LibraryFooter
			ticked={ticked.length}
			tray={tickTray(ticked, browser.seen)}
			{full}
			{copying}
			onclear={() => (ticked = [])}
			onuntick={toggle}
			onadd={add}
		/>
	</div>
</dialog>
