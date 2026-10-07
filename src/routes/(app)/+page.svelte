<script lang="ts">
	import { glide, reveal } from '$lib/motion/motion.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MomentComposer from '$lib/components/MomentComposer.svelte';
	import PersonFinder from '$lib/components/PersonFinder.svelte';
	import StreamNotice from '$lib/components/StreamNotice.svelte';
	import StreamCirclePhoto from '$lib/components/StreamCirclePhoto.svelte';
	import { asTyped, newPeopleAsCandidates } from '$lib/mentions/picks';
	import { dayLabel as calendarDayLabel } from '$lib/dates/labels';
	import { streamDays, streamTime } from '$lib/stream/days';
	import StreamWhen from '$lib/components/StreamWhen.svelte';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import WelcomeCard from '$lib/components/WelcomeCard.svelte';
	import { contactSectionPath } from '$lib/contacts/sections';
	import { occasionLabel, whenLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { relationshipRowLabel } from '$lib/relationships/labels';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import type { MessageKey } from '$lib/i18n/translate';
	import {
		isNarrowed,
		NO_FILTER,
		offersMemberChoice,
		STREAM_KINDS,
		streamFilterHref,
		type StreamKind
	} from '$lib/stream/filter';
	import { filterPill } from '$lib/stream/filter-pill';
	import { showsActorBadge } from '$lib/stream/actor-badge';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	/** Whom a stream notice may link to: the people this reader can see. */
	const peopleIds = $derived(new Set(data.people.map((p) => p.id)));

	const i18n = useI18n();
	const t = i18n.t;

	// The stream by day, read against the clock at the moment it is drawn (docs/02 §2.22.2).
	const stream = $derived.by(() => {
		const now = Date.now();
		return {
			days: streamDays(i18n, data.stream, now),
			when: (at: number) => streamTime(i18n, at, now)
		};
	});
	const days = $derived(stream.days);

	let hintDismissed = $state(false);

	// The filter chips (docs/02 §2.22.2) are plain links, so a filter survives a reload, the
	// back button undoes it, and it works before the page has hydrated.
	const KIND_LABEL: Record<StreamKind, MessageKey> = {
		moment: 'home.filter.kind.moment',
		interaction: 'home.filter.kind.interaction',
		relationship: 'home.filter.kind.relationship',
		person: 'home.filter.kind.person',
		circlePhoto: 'home.filter.kind.circlePhoto',
		notice: 'home.filter.kind.notice'
	};
	const filtered = $derived(isNarrowed(data.filter));
	// The phone's pill: its count, highlight and the short summary beside it (docs/05 §5.5).
	const pill = $derived(filterPill(data.filter));
	const pillSummary = $derived(
		pill.narrowedTo
			.map((narrowed) =>
				narrowed.axis === 'kind'
					? t(KIND_LABEL[narrowed.kind])
					: narrowed.memberId === data.user.id
						? t('home.you')
						: (data.members.find((member) => member.id === narrowed.memberId)?.name ?? '')
			)
			.join(' · ')
	);
	const FILTER_SHEET = 'stream-filter-sheet';
	// Colour, border and weight come whole from one of the two looks, never a static utility
	// beside a conditional one on the same property — stylesheet order would pick the winner.
	const PILL =
		'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors';
	const PILL_OFF = 'border-border bg-card font-medium text-fg-muted hover:text-fg';
	const PILL_ON = 'border-primary/45 bg-primary-soft font-semibold text-fg';
	const CHIP_ROW = 'flex flex-wrap items-center gap-1';
	const CHIP =
		'rounded-full px-3 py-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg aria-[current=true]:bg-primary-soft aria-[current=true]:font-semibold aria-[current=true]:text-fg';
	// Words on a tint, and labels that carry content, are written in --fg / --fg-muted: in Latte
	// --primary on its own tint and --fg-subtle on the page ground both fall below AA (docs/05 §5.6).
	// The row's label is quiet sentence case, part of the control: the uppercase label is kept
	// for dividers inside a list (docs/05 §5.3).
	const CHIP_ROW_LABEL = 'mr-1 min-w-10 text-sm font-medium text-fg-muted';

	// The rail's rows: one vertical list at every width — beside the stream from lg, above or
	// below it on a phone. Nothing scrolls sideways, so nothing hides off the right edge.
	const RAIL_LIST = 'flex flex-col';
	const RAIL_ROW =
		'grid grid-cols-[28px_1fr] items-center gap-2.5 rounded-app px-1.5 py-1.5 transition-colors hover:bg-card';

	// A phone shows the first few rows of the band and keeps the rest one tap away, so a full
	// band never pushes the stream off the screen; from lg the whole band is there (docs/05 §5.5).
	const RAIL_CAP = 3;
	const RAIL_OVERFLOW = 'max-lg:hidden';

	// Below `lg` the page is one column: heading, capture field, then either the rail and the
	// stream or the stream and the rail — the rail earns the place above the stream only while
	// a date is close (`railFirst`, docs/05 §5.5). The capture field stays on top either way.
	const RAIL_BEFORE_STREAM = 'max-lg:order-2';
	const RAIL_AFTER_STREAM = 'max-lg:order-4';
	const railOrder = $derived(data.railFirst ? RAIL_BEFORE_STREAM : RAIL_AFTER_STREAM);

	let showAllUpcoming = $state(false);

	// On a phone the composer is a sheet over the stream, opened by the pencil in the tab bar
	// (`/?compose`) and closed by handing the URL back — so the open state lives in the URL
	// and survives a reload, and there is nothing to keep in sync with the tab bar.
	// Below `md` the composer lives in the sheet and the top of Home is the person search;
	// above it, the composer sits at the top of the stream. One of them is mounted at a time,
	// so there is exactly one "What happened?" field on the page.
	// The kept moment open in the composer, if any (see below).
	let editing = $state<KeptOf<'moment.capture'> | null>(null);

	// The sheet also opens as shallow state (`page.state.compose`): that needs no server round
	// trip, so the pencil still works while Stella is out of reach.
	const phone = new MediaQuery('(width < 48rem)');
	const sheetOpen = $derived(
		(data.compose ||
			page.state.compose === true ||
			page.url.searchParams.has('compose') ||
			editing !== null) &&
			phone.current
	);
	function closeSheet() {
		if (editing) return void stopEditing();
		if (page.state.compose) return history.back();
		void goto('/', { replaceState: true, noScroll: true });
	}

	/*
	 * Moments kept on this device while Stella was out of reach (docs/02 §2.18.1), shown where they
	 * will land: under the capture field, marked as not sent yet. One can
	 * be opened in the composer until it is on its way; discarding asks twice, because the
	 * device holds the only copy.
	 */
	async function edit(item: KeptOf<'moment.capture'>) {
		if (!(await outbox.hold(item.command.id))) return;
		const held = outbox.mine.find((i) => i.command.id === item.command.id);
		editing = held && isKept(held, 'moment.capture') ? held : null;
	}
	async function stopEditing() {
		const item = editing;
		editing = null;
		if (item) await outbox.release(item.command.id);
	}
	/** The day a kept moment is about, read the reader's way. */
	function keptDay(iso: string): string {
		return new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.intlLocale, {
			day: 'numeric',
			month: 'long'
		});
	}
</script>

<svelte:head><title>{t('home.title')}</title></svelte:head>

{#snippet composer()}
	{#key `${data.draft}:${editing?.command.id ?? ''}`}
		<MomentComposer
			candidates={data.people}
			me={{ id: data.user.id, name: data.user.name }}
			today={data.today}
			error={editing ? null : (form?.momentError ?? null)}
			draft={form?.draft ?? data.draft}
			autofocus={data.compose || page.state.compose === true || editing !== null}
			{editing}
			onEditDone={stopEditing}
			onKept={() => sheetOpen && closeSheet()}
		/>
	{/key}
{/snippet}

<!-- From lg the rail's 17 rem column is there only while a date is close; otherwise the stream
     takes the width (docs/05 §5.5). One class either way, never a static and a toggled one. -->
<main
	class="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 md:px-6 md:py-10 lg:grid-rows-[auto_auto_1fr] {data
		.upcoming.length
		? 'lg:grid-cols-[minmax(0,1fr)_17rem]'
		: 'lg:grid-cols-[minmax(0,1fr)]'}"
>
	<!-- The heading speaks to the composer; a phone's Home opens on the person search instead, so
     there it is left to screen readers and the search takes the top. -->
	<header class="max-md:sr-only lg:col-start-1 lg:row-start-1">
		<h1 class="text-2xl font-semibold text-fg">{t('home.heading')}</h1>
		<p class="text-sm text-fg-muted">{t('home.intro')}</p>
	</header>

	<div class="flex min-w-0 flex-col max-lg:order-1 lg:col-start-1 lg:row-start-2">
		<!-- Desktop: the composer sits at the top. Phone: a person search, and the composer as a
	     sheet over the stream (below). -->
		<div class="max-md:hidden">
			{#if !phone.current}{@render composer()}{/if}
		</div>
		<div class="md:hidden">
			{#if sheetOpen || (form?.momentError && phone.current)}
				<!-- A modal <dialog>, so the platform keeps focus inside, Escape closes and the stream
			     behind is out of reach for a screen reader too (docs/05 §5.9). Not a scroll box:
			     the day calendar and the @-picker open past its top edge. -->
				<dialog
					{@attach (sheet: HTMLDialogElement) => sheet.showModal()}
					oncancel={(event) => {
						event.preventDefault();
						closeSheet();
					}}
					onclick={(event) => event.target === event.currentTarget && closeSheet()}
					aria-label={t('nav.writeMoment')}
					class="mt-auto mb-0 w-full max-w-none overflow-visible rounded-t-app bg-bg p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
					data-testid="compose-sheet"
				>
					<!-- The padding lives inside, so a tap on the sheet's edge is not a tap on the backdrop. -->
					<div class="p-3 pb-4">
						<div class="mx-auto mb-2 h-1 w-10 rounded-full bg-border"></div>
						{@render composer()}
					</div>
				</dialog>
			{:else}
				<!-- The pencil in the tab bar writes; the top of a phone's Home finds a person. -->
				<PersonFinder people={data.people} />
			{/if}
		</div>

		{#if outbox.mine.length}
			<section
				class="mt-3 flex flex-col gap-1.5"
				aria-label={t('home.outbox.label')}
				data-testid="outbox"
			>
				{#each outbox.mine as item (item.command.id)}
					{#if isKept(item, 'moment.capture')}
						<KeptItem {item} onEdit={() => edit(item)}>
							{#snippet meta()}
								<span
									class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
									title={item.command.payload.entryDate}
									>{keptDay(item.command.payload.entryDate)}</span
								>
							{/snippet}
							<p class="mt-1 whitespace-pre-line text-fg">
								{asTyped(item.command.payload.body, [
									...data.people,
									...newPeopleAsCandidates(item.command.payload.newPeople)
								])}
							</p>
						</KeptItem>
					{:else if isKept(item, 'note.add')}
						<KeptItem {item} editHref={contactSectionPath(item.command.payload.contactId, 'notes')}>
							{#snippet meta()}<span>{t('home.outbox.noteOn', { name: item.about ?? '' })}</span
								>{/snippet}
							<p class="mt-1 whitespace-pre-line text-fg">
								{asTyped(item.command.payload.body, data.people)}
							</p>
						</KeptItem>
					{:else if isKept(item, 'interaction.log')}
						{@const kind = KIND_PRESENTATION[item.command.payload.kind]}
						<KeptItem {item} editHref={contactSectionPath(item.command.payload.contactId, 'story')}>
							{#snippet meta()}
								<span>· {t(kind.label)} · {item.about ?? ''}</span>
								<span
									class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
									title={item.command.payload.happenedAt}
									>{keptDay(item.command.payload.happenedAt)}</span
								>
							{/snippet}
							{#if item.command.payload.title}<p class="mt-1 text-fg">
									{item.command.payload.title}
								</p>{/if}
						</KeptItem>
					{:else if isKept(item, 'tag.assign')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.tagOn', { name: item.about ?? '' })}</span
								>{/snippet}
							<p class="mt-1 text-fg">{item.command.payload.name}</p>
						</KeptItem>
					{:else if isKept(item, 'contact.add')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.newPerson')}</span>{/snippet}
							<p class="mt-1 text-fg">{item.about ?? ''}</p>
						</KeptItem>
					{:else if isKept(item, 'relationship.add')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.link')}</span>{/snippet}
							<p class="mt-1 text-fg">{item.about ?? ''}</p>
						</KeptItem>
					{:else if isKept(item, 'circle.join')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.circleFor', { name: item.about ?? '' })}</span
								>{/snippet}
							<p class="mt-1 text-fg">
								{item.command.payload.circleName}{item.command.payload.role
									? ` · ${item.command.payload.role}`
									: ''}
							</p>
						</KeptItem>
					{:else if isKept(item, 'journal.write')}
						<KeptItem {item}>
							{#snippet meta()}
								<span>{t('home.outbox.journalOf', { name: item.about ?? '' })}</span>
								<span
									class="ml-auto text-xs whitespace-nowrap text-fg-subtle"
									title={item.command.payload.entryDate}
									>{keptDay(item.command.payload.entryDate)}</span
								>
							{/snippet}
							<p class="mt-1 whitespace-pre-line text-fg">
								{asTyped(item.command.payload.body, data.people)}
							</p>
						</KeptItem>
					{:else if isKept(item, 'field.add')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.contactFor', { name: item.about ?? '' })}</span
								>{/snippet}
							<p class="mt-1 text-fg">{item.command.payload.value}</p>
						</KeptItem>
					{:else if isKept(item, 'date.add')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.dateFor', { name: item.about ?? '' })}</span
								>{/snippet}
							<p class="mt-1 text-fg">
								{[item.command.payload.label, calendarDayLabel(i18n, item.command.payload.date)]
									.filter(Boolean)
									.join(' · ')}
							</p>
						</KeptItem>
					{:else if isKept(item, 'gallery.add')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.photosOf', { name: item.about ?? '' })}</span
								>{/snippet}
						</KeptItem>
					{:else if isKept(item, 'circleGallery.add')}
						<KeptItem {item}>
							{#snippet meta()}<span>{t('home.outbox.photosFor', { name: item.about ?? '' })}</span
								>{/snippet}
						</KeptItem>
					{/if}
				{/each}
			</section>
		{/if}
	</div>

	<div class="flex min-w-0 flex-col gap-6 max-lg:order-3 lg:col-start-1 lg:row-start-3">
		{#if data.welcome}<WelcomeCard steps={data.welcome} />{/if}
		{#if data.linkSuggestion && !hintDismissed}
			<div
				transition:reveal
				class="flex items-center gap-3 rounded-app border border-success/35 bg-success/10 px-4 py-2.5 text-sm text-fg"
				role="status"
			>
				<div class="flex-1">
					<b class="font-semibold">
						{t('home.link.question', {
							a: data.linkSuggestion.a.name,
							b: data.linkSuggestion.b.name
						})}
					</b>
					<span class="block text-xs text-fg-muted">{t('home.link.hint')}</span>
				</div>
				<Button
					variant="primary"
					size="sm"
					href="/contacts/{data.linkSuggestion.a.id}?relate={data.linkSuggestion.b
						.id}#relationships"
				>
					{t('home.link.confirm')}
				</Button>
				<Button variant="ghost" size="sm" href="/" onclick={() => (hintDismissed = true)}>
					{t('home.link.notNow')}
				</Button>
			</div>
		{/if}

		{#if days.length || filtered}
			<!-- Below md the two rows would wrap to four lines and push the stream past the fold, so
		     they fold into one pill and a sheet (docs/05 §5.5). The sheet is a native popover:
		     the pill opens it, a tap outside, Escape or *Done* closes it, all without JavaScript,
		     and the chips inside stay the same links. -->
			<div class="flex min-w-0 items-center gap-2.5 md:hidden" data-testid="stream-filter-pill">
				<button
					type="button"
					popovertarget={FILTER_SHEET}
					aria-label={t('home.filter.pillLabel', { count: pill.count })}
					class="{PILL} {pill.highlighted ? PILL_ON : PILL_OFF}"
				>
					<Icon name="filter" size={15} />
					{t('home.filter.pill')}
					{#if pill.count}
						<span
							class="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-fg tabular-nums"
							>{pill.count}</span
						>
					{/if}
				</button>
				{#if pill.narrowedTo.length}
					<span class="min-w-0 truncate text-[13px] text-fg-muted">{pillSummary}</span>
				{/if}
			</div>
			<div
				id={FILTER_SHEET}
				popover="auto"
				role="dialog"
				aria-labelledby="{FILTER_SHEET}-title"
				data-sveltekit-noscroll
				class="inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[20px] bg-bg px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-[3px] md:hidden"
			>
				<h2 id="{FILTER_SHEET}-title" class="mb-3 text-base font-semibold">
					{t('home.filter.label')}
				</h2>
				<div class="flex flex-col gap-3">
					{@render filterRows()}
				</div>
				<div class="mt-4 flex items-center justify-between">
					{#if filtered}
						<a href={streamFilterHref(NO_FILTER)} class="text-sm text-link hover:underline"
							>{t('home.filter.clear')}</a
						>
					{/if}
					<Button
						variant="secondary"
						class="ml-auto"
						popovertarget={FILTER_SHEET}
						popovertargetaction="hide"
					>
						{t('home.filter.done')}
					</Button>
				</div>
			</div>
			<nav
				class="flex flex-col gap-1.5 max-md:hidden"
				aria-label={t('home.filter.label')}
				data-testid="stream-filter"
				data-sveltekit-noscroll
			>
				{@render filterRows()}
			</nav>
		{/if}

		{#if days.length}
			<ol class="flex flex-col" data-testid="stream">
				{#each days as day (day.label)}
					<li>
						<div
							class="flex items-center gap-3 pt-4 pb-1.5 text-xs font-semibold tracking-wider text-fg-subtle uppercase"
						>
							{day.label}<span class="h-px flex-1 bg-border"></span>
						</div>
						{#each day.items as item (item.kind + item.id)}
							<article
								class="group grid grid-cols-[32px_1fr] gap-3 rounded-app px-2.5 py-2.5 transition-colors hover:bg-card"
							>
								{#if item.kind === 'moment'}
									{@render face(item.anchor, item)}
									<div class="min-w-0">
										<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
											<b class="font-semibold text-fg"
												>{item.mine ? t('home.you') : item.actor.name}</b
											>
											<span>{t('home.stream.wroteIn')}</span>
											<span
												><a
													href="/contacts/{item.anchor.id}/journal"
													class="font-medium text-fg hover:underline">{item.anchor.name}</a
												>{t('home.stream.wroteInJournal')}</span
											>
											{#if item.visibility === 'private'}<span
													class="inline-flex items-center gap-1 text-[11px] text-fg-subtle"
													title={t('common.onlyYouSee')}
													><Icon name="private" size={11} />{t('common.privateInline')}</span
												>{/if}
											<StreamWhen time={stream.when(item.at)} />
										</div>
										<!-- A full-width stream would run a line past 1000 px; ~72 characters
										     keep it readable. -->
										<div class="note-body mt-1 max-w-[72ch] text-fg">{@html item.bodyHtml}</div>
										{#if item.photoIds.length}
											<div class="mt-2 flex gap-1.5">
												{#each item.photoIds as photoId, index (photoId)}
													<a
														href="/media/{photoId}"
														target="_blank"
														rel="noreferrer"
														class="block overflow-hidden rounded-md border border-border"
													>
														<img
															src="/media/{photoId}?thumb"
															alt={t('components.photo.open', {
																n: index + 1,
																count: item.photoIds.length
															})}
															loading="lazy"
															class="size-16 object-cover"
														/>
													</a>
												{/each}
											</div>
										{/if}
										<!-- The people a moment mentions are chips in its body already; only an
										     interaction, whose participants the text does not name, lists them. -->
									</div>
								{:else if item.kind === 'person'}
									{@render face(item.person, item)}
									<div class="min-w-0">
										<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
											<b class="font-semibold text-fg"
												>{item.mine ? t('home.you') : item.actor.name}</b
											>
											<span>{t('home.stream.added')}</span>
											<a
												href="/contacts/{item.person.id}"
												class="font-medium text-fg hover:underline">{item.person.name}</a
											>
											{#if t('home.stream.addedAfter')}<span>{t('home.stream.addedAfter')}</span
												>{/if}
											<span
												class="rounded bg-success/16 px-1.5 text-[10px] font-semibold tracking-wide text-fg uppercase"
												>{t('home.stream.newPerson')}</span
											>
											{#if item.visibility === 'private'}<span
													class="inline-flex items-center gap-1 text-[11px] text-fg-subtle"
													title={t('common.onlyYouSee')}
													><Icon name="private" size={11} />{t('common.privateInline')}</span
												>{/if}
											<StreamWhen time={stream.when(item.at)} />
										</div>
										{#if item.description}<p class="mt-0.5 text-sm text-fg-muted">
												{item.description}
											</p>{/if}
									</div>
								{:else if item.kind === 'interaction'}
									{@const kind = KIND_PRESENTATION[item.interactionKind]}
									{@render face(item.subject, item)}
									<div class="min-w-0">
										<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
											<b class="font-semibold text-fg"
												>{item.mine ? t('home.you') : item.actor.name}</b
											>
											<span>{t('home.stream.logged')}</span>
											<span class="inline-flex items-center gap-1 font-semibold text-fg"
												><span style="color:{kind.accent}"><Icon name={kind.icon} size={12} /></span
												>{t(kind.label)}</span
											>
											<span>{t('home.stream.loggedWith')}</span>
											<a
												href="/contacts/{item.subject.id}"
												class="font-medium text-fg hover:underline">{item.subject.name}</a
											>
											{#if t('home.stream.loggedAfter')}<span>{t('home.stream.loggedAfter')}</span
												>{/if}
											{#if item.visibility === 'private'}<span
													class="inline-flex items-center gap-1 text-[11px] text-fg-subtle"
													title={t('common.onlyYouSee')}
													><Icon name="private" size={11} />{t('common.privateInline')}</span
												>{/if}
											<StreamWhen time={stream.when(item.at)} />
										</div>
										{#if item.title}<p class="mt-0.5 text-sm text-fg">{item.title}</p>{/if}
										{#if item.participants.length}
											<div class="mt-1.5 flex flex-wrap gap-1.5">
												{#each item.participants as m (m.id)}
													<a
														href="/contacts/{m.id}"
														class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pr-2 pl-1 text-xs text-fg-muted hover:text-fg"
													>
														<Avatar
															id={m.id}
															name={m.name}
															avatarPhotoId={m.avatarPhotoId}
															size={18}
														/>{m.name}
													</a>
												{/each}
											</div>
										{/if}
									</div>
								{:else if item.kind === 'circlePhoto'}
									<StreamCirclePhoto
										{item}
										who={item.mine ? t('home.you') : item.actor.name}
										time={stream.when(item.at)}
									/>
								{:else if item.kind === 'notice'}
									<StreamNotice
										content={item.content}
										who={item.mine ? t('home.you') : item.actor.name}
										time={stream.when(item.at)}
										canOpen={(id) => peopleIds.has(id)}
									/>
								{:else}
									{@render face(item.from, item)}
									<div class="min-w-0">
										<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
											<b class="font-semibold text-fg"
												>{item.mine ? t('home.you') : item.actor.name}</b
											>
											<span>{t('home.stream.linked')}</span>
											<a href="/contacts/{item.from.id}" class="font-medium text-fg hover:underline"
												>{item.from.name}</a
											>
											<span class="text-fg-subtle">→</span>
											<span>{relationshipRowLabel(t, item)}</span>
											<a href="/contacts/{item.to.id}" class="font-medium text-fg hover:underline"
												>{item.to.name}</a
											>
											{#if t('home.stream.linkedAfter')}<span>{t('home.stream.linkedAfter')}</span
												>{/if}
											<span
												class="rounded bg-link/16 px-1.5 text-[10px] font-semibold tracking-wide text-fg uppercase"
												>{t('home.stream.relationship')}</span
											>
											<StreamWhen time={stream.when(item.at)} />
										</div>
									</div>
								{/if}
							</article>
						{/each}
					</li>
				{/each}
			</ol>
		{:else if filtered}
			<EmptyState
				icon="write"
				title={t('home.filter.empty.title')}
				hint={t('home.filter.empty.hint')}
			>
				<Button variant="secondary" href={streamFilterHref(NO_FILTER)}
					>{t('home.filter.clear')}</Button
				>
			</EmptyState>
		{:else if !data.welcome}
			<EmptyState icon="write" title={t('home.empty.title')} hint={t('home.empty.hint')} />
		{/if}
	</div>

	<!-- A row leads with its subject's face; on a row another member wrote, their own small face
	     sits on its corner (docs/05 §5.5). The sentence names them already, so it is decorative.
	     Its ring is the row's ground, and follows the row's hover tint. -->
	{#snippet face(
		person: { id: string; name: string; avatarPhotoId: string | null },
		row: { mine: boolean; actor: { id: string; name: string } }
	)}
		<span class="relative size-8">
			<Avatar id={person.id} name={person.name} avatarPhotoId={person.avatarPhotoId} size={32} />
			{#if showsActorBadge(row, data.members)}
				<span
					class="absolute -right-1 -bottom-1 rounded-full ring-2 ring-bg transition-shadow group-hover:ring-card"
					aria-hidden="true"
					data-testid="actor-badge"
				>
					<Avatar id={row.actor.id} name={row.actor.name} size={16} />
				</span>
			{/if}
		</span>
	{/snippet}

	{#snippet filterRows()}
		<div class={CHIP_ROW}>
			<span class={CHIP_ROW_LABEL}>{t('home.filter.kind')}</span>
			{@render chip(
				t('home.filter.kind.all'),
				{ ...data.filter, kind: null },
				data.filter.kind === null
			)}
			{#each STREAM_KINDS as kind (kind)}
				{@render chip(t(KIND_LABEL[kind]), { ...data.filter, kind }, data.filter.kind === kind)}
			{/each}
		</div>
		{#if offersMemberChoice(data.members)}
			<div class={CHIP_ROW}>
				<span class={CHIP_ROW_LABEL}>{t('home.filter.member')}</span>
				{@render chip(
					t('home.filter.member.all'),
					{ ...data.filter, memberId: null },
					data.filter.memberId === null
				)}
				{#each data.members as member (member.id)}
					{@render chip(
						member.id === data.user.id ? t('home.you') : member.name,
						{ ...data.filter, memberId: member.id },
						data.filter.memberId === member.id
					)}
				{/each}
			</div>
		{/if}
	{/snippet}

	{#snippet chip(label: string, target: typeof data.filter, current: boolean)}
		<a href={streamFilterHref(target)} class={CHIP} aria-current={current ? 'true' : undefined}
			>{label}</a
		>
	{/snippet}

	{#snippet showAll(total: number, reveal: () => void)}
		<button
			type="button"
			class="self-start px-1.5 pt-1.5 text-xs font-medium text-link hover:underline lg:hidden"
			onclick={reveal}
		>
			{t('home.showAll', { count: total })}
		</button>
	{/snippet}

	<!-- The rail: what is coming up. It is absent when nothing is, because a box that is
     permanently empty teaches people to stop looking at it; from lg its column goes with it,
     and the stream takes the width rather than leave a quarter of the screen blank. -->
	{#if data.upcoming.length}
		<aside
			class="flex min-w-0 flex-col lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start {railOrder}"
			aria-label={t('home.atAGlance')}
		>
			<section data-testid="coming-up">
				<h2 class="flex items-center gap-2 pb-2 text-sm font-semibold text-fg">
					<Icon name="calendar" size={13} />{t('home.comingUp')}
				</h2>
				<!-- *Show all* opens the rest of the list in place (docs/05 §5.11). -->
				<ul class={RAIL_LIST} use:glide={{ key: showAllUpcoming }}>
					{#each data.upcoming as item, i (item.contactId + item.date + item.kind)}
						<li class="{RAIL_ROW} {i >= RAIL_CAP && !showAllUpcoming ? RAIL_OVERFLOW : ''}">
							<Avatar
								id={item.contactId}
								name={item.contactName}
								avatarPhotoId={item.avatarPhotoId}
								size={28}
							/>
							<div class="min-w-0 text-[13px] leading-snug text-fg-muted">
								<a href="/contacts/{item.contactId}" class="font-semibold text-fg hover:underline"
									>{item.contactName}</a
								>
								<span>{occasionLabel(i18n, item)}</span>
								<span class="block text-xs text-fg-subtle">
									{whenLabel(i18n, item.daysUntil, item.date)}
									<span aria-hidden="true">·</span>
									<a href="/?about={item.contactId}" class="text-link hover:underline"
										>{t('home.writeMoment')}</a
									>
								</span>
							</div>
						</li>
					{/each}
				</ul>
				{#if data.upcoming.length > RAIL_CAP && !showAllUpcoming}
					{@render showAll(data.upcoming.length, () => (showAllUpcoming = true))}
				{/if}
			</section>
		</aside>
	{/if}
</main>
