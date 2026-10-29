<!--
  @component
  *From Immich* (docs/02 §2.24.9, docs/design/screens/immich-library.md): a sheet from the bottom
  with every photo Immich has from one day, whoever is in it, and a smart search across the whole
  library. Taps tick photos, numbered in order; *Add N photos* copies them through Stella's signed
  proxy and hands them over as files, for the same pipeline as a pick from the device.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { LibraryPhoto, LibraryView } from '$lib/immich/library';
	import {
		LIBRARY_PICK_LIMIT,
		libraryQueryUrl,
		tickNumber,
		toggledTick,
		type LibraryQuery
	} from '$lib/immich/library-pick';
	import { copyImmichPhoto, type ImmichCopy } from '$lib/media/copy-immich-photo';
	import { useRemovals } from '$lib/undo/context.svelte';

	interface Props {
		/** Bindable: set to open the sheet; it clears it when it closes. */
		open?: boolean;
		/** The day the sheet opens on, `YYYY-MM-DD`: the entry's; a gallery has none, so today. */
		day?: string | null;
		/** The ticked photos, copied, in the order they were ticked. The sheet then closes. */
		onadd: (copies: ImmichCopy[]) => void;
	}

	let { open = $bindable(false), day = null, onadd }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const uid = $props.id();
	const titleId = `${uid}-title`;
	let dialog = $state<HTMLDialogElement>();
	let gridTop = $state<HTMLElement>();

	let asked = $state<LibraryQuery>({ day: '' });
	let view = $state<LibraryView | null>(null);
	let query = $state('');
	/** The day the arrows were last on, to come back to when the search is cleared. */
	let lastDay = $state('');
	let ticked = $state<readonly string[]>([]);
	/** Every photo seen since opening, so a tick survives a step to another day. */
	const seen = new Map<string, LibraryPhoto>();
	let copying = $state<{ done: number; count: number } | null>(null);
	let copyError = $state<string | null>(null);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			ticked = [];
			seen.clear();
			query = '';
			copyError = null;
			// `en-CA` spells a date as `YYYY-MM-DD`, on the device's own calendar.
			const first = day ?? new Date().toLocaleDateString('en-CA');
			lastDay = first;
			dialog.showModal();
			void load({ day: first });
		} else if (!open && dialog.open) dialog.close();
	});

	// Only the latest question may fill the grid: a slower answer to an earlier one arrives last.
	let latest = 0;
	async function load(next: LibraryQuery) {
		const mine = ++latest;
		asked = next;
		view = null;
		if ('day' in next) lastDay = next.day;
		let answer: LibraryView;
		try {
			const response = await fetch(libraryQueryUrl(next));
			answer = response.ok ? ((await response.json()) as LibraryView) : { state: 'unreachable' };
		} catch {
			answer = { state: 'unreachable' };
		}
		if (mine !== latest) return;
		if (answer.state === 'day' || answer.state === 'found') {
			for (const photo of answer.photos) seen.set(photo.id, photo);
		}
		view = answer;
		await tick();
		gridTop?.scrollTo({ top: 0 });
	}

	// Enter searches — not a form of its own: the sheet may sit inside the upload's form.
	function search(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const words = query.trim();
		void load(words === '' ? { day: lastDay } : { query: words });
	}

	function clearSearch() {
		query = '';
		void load({ day: lastDay });
	}

	async function add() {
		const photos = ticked.flatMap((id) => seen.get(id) ?? []);
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
		onadd(copies);
		removals.notify(t('immich.library.added', { count: copies.length }));
		open = false;
	}

	/** A day as the heading says it: *Sunday, 26 October 2026*. */
	function longDay(value: string): string {
		return new Date(`${value}T00:00:00Z`).toLocaleDateString(i18n.intlLocale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	/** What a tile says: the time on a day, the date in a search. */
	function when(photo: LibraryPhoto): string | null {
		if (photo.takenAt === null) return null;
		if (view?.state === 'day') return photo.takenAt.slice(11, 16);
		return new Date(`${photo.takenAt.slice(0, 10)}T00:00:00Z`).toLocaleDateString(i18n.intlLocale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	const photos = $derived(view?.state === 'day' || view?.state === 'found' ? view.photos : []);
	const searching = $derived('query' in asked);
	const full = $derived(ticked.length >= LIBRARY_PICK_LIMIT);
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
				class="w-full rounded-control border border-border-input bg-bg py-2 pr-3 pl-9 text-fg"
			/>
		</div>

		{#if searching}
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="truncate text-fg-muted"
					>{'query' in asked ? t('immich.library.bestMatches', { query: asked.query }) : ''}</span
				>
				<Button type="button" variant="ghost" size="sm" onclick={clearSearch}
					>{t('immich.library.clearSearch')}</Button
				>
			</div>
		{:else if view?.state !== 'unreachable'}
			<div class="flex items-center gap-2" data-testid="immich-library-day">
				<button
					type="button"
					class="grid size-9 place-items-center rounded-full text-fg-muted enabled:hover:bg-card-hover disabled:opacity-35"
					aria-label={t('immich.library.earlier')}
					disabled={view?.state !== 'day' || view.earlier === null}
					onclick={() => view?.state === 'day' && view.earlier && load({ day: view.earlier })}
					><Icon name="back" size={18} /></button
				>
				<div class="min-w-0 flex-1 text-center">
					<p class="truncate text-sm font-semibold">{longDay(lastDay)}</p>
					<p class="text-xs text-fg-subtle">
						{view?.state === 'day' ? t('immich.library.photoCount', { count: photos.length }) : ' '}
					</p>
				</div>
				<button
					type="button"
					class="grid size-9 place-items-center rounded-full text-fg-muted enabled:hover:bg-card-hover disabled:opacity-35"
					aria-label={t('immich.library.later')}
					disabled={view?.state !== 'day' || view.later === null}
					onclick={() => view?.state === 'day' && view.later && load({ day: view.later })}
					><Icon name="forward" size={18} /></button
				>
			</div>
		{/if}

		<div
			bind:this={gridTop}
			class="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"
			aria-busy={view === null}
		>
			{#if view === null}
				<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-hidden="true">
					{#each { length: 12 }, i (i)}
						<li class="aspect-square animate-pulse rounded-control bg-bg-sunken"></li>
					{/each}
				</ul>
			{:else if view.state === 'unreachable'}
				<div class="flex flex-col items-center gap-2 py-10 text-center text-sm">
					<Icon name="conflict" size={28} class="text-fg-subtle" />
					<b>{t('immich.library.unreachable')}</b>
					<span class="text-fg-muted">{t('immich.library.unreachableHint')}</span>
					<Button type="button" size="sm" onclick={() => load(asked)}
						>{t('immich.library.tryAgain')}</Button
					>
				</div>
			{:else if view.state === 'searchOff'}
				<p
					class="rounded-control bg-bg-sunken p-3 text-sm text-fg-muted"
					data-testid="immich-search-off"
				>
					{t('immich.library.searchOff')}
				</p>
			{:else if photos.length === 0}
				<div class="flex flex-col items-center gap-2 py-10 text-center text-sm">
					<Icon name="calendar" size={28} class="text-fg-subtle" />
					{#if view.state === 'found'}
						<b>{t('immich.library.noMatch', { query: 'query' in asked ? asked.query : '' })}</b>
					{:else}
						<b>{t('immich.library.noneOnDay', { day: longDay(view.day) })}</b>
						{#if view.earlier || view.later}
							<span class="text-fg-muted">{t('immich.library.arrowsSkip')}</span>
						{/if}
					{/if}
				</div>
			{:else}
				<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-4" data-testid="immich-library-photos">
					{#each photos as photo (photo.id)}
						{@const number = tickNumber(ticked, photo.id)}
						{@const label = when(photo)}
						<li>
							<button
								type="button"
								class="group relative block aspect-square w-full overflow-hidden rounded-control bg-bg-sunken aria-pressed:ring-3 aria-pressed:ring-primary aria-pressed:ring-inset"
								aria-pressed={number !== null}
								aria-label={label
									? t('immich.library.photo', { when: label })
									: t('immich.library.photoUndated')}
								disabled={copying !== null || (full && number === null)}
								onclick={() => (ticked = toggledTick(ticked, photo.id))}
							>
								<img
									src={photo.thumbnailUrl}
									alt=""
									loading="lazy"
									class="size-full object-cover transition-opacity group-disabled:opacity-50"
								/>
								<span
									class="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2 border-white text-xs font-bold text-primary-fg tabular-nums shadow-card {number
										? 'bg-primary'
										: 'bg-black/20'}"
									aria-hidden="true">{number ?? ''}</span
								>
								{#if label}
									<span
										class="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[11px] text-white tabular-nums"
										aria-hidden="true">{label}</span
									>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<FormError message={copyError} />
		<div class="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
			{#if copying}
				<span class="text-fg-muted" aria-live="polite"
					>{t('immich.library.copying', { done: copying.done + 1, count: copying.count })}</span
				>
			{:else if ticked.length}
				<span class="flex items-center gap-1 text-fg-muted">
					<b class="text-fg">{t('immich.library.ticked', { count: ticked.length })}</b>
					{#if full}· {t('immich.library.atMost', { count: LIBRARY_PICK_LIMIT })}{/if}
					· <Button type="button" variant="ghost" size="sm" onclick={() => (ticked = [])}
						>{t('immich.library.clear')}</Button
					>
				</span>
			{:else}
				<span class="text-fg-subtle">{t('immich.library.tapToTick')}</span>
			{/if}
			<Button
				type="button"
				variant="primary"
				disabled={ticked.length === 0 || copying !== null}
				onclick={add}
				>{ticked.length
					? t('immich.library.add', { count: ticked.length })
					: t('immich.library.addPhotos')}</Button
			>
		</div>
	</div>
</dialog>
