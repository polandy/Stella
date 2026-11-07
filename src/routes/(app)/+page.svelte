<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MomentComposer from '$lib/components/stream/MomentComposer.svelte';
	import PersonFinder from '$lib/components/people/PersonFinder.svelte';
	import StreamNotice from '$lib/components/stream/StreamNotice.svelte';
	import StreamCirclePhoto from '$lib/components/stream/StreamCirclePhoto.svelte';
	import { savedMomentAnchor } from '$lib/stream/saved-moment';
	import { streamDays, streamTime } from '$lib/stream/days';
	import StreamMoment from '$lib/components/stream/StreamMoment.svelte';
	import StreamPersonAdded from '$lib/components/stream/StreamPersonAdded.svelte';
	import StreamInteraction from '$lib/components/stream/StreamInteraction.svelte';
	import StreamRelationship from '$lib/components/stream/StreamRelationship.svelte';
	import ComposeSheet from '$lib/components/stream/ComposeSheet.svelte';
	import HomeRail from '$lib/components/stream/HomeRail.svelte';
	import KeptList from '$lib/components/pwa/KeptList.svelte';
	import StreamFilter from '$lib/components/stream/StreamFilter.svelte';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import WelcomeCard from '$lib/components/stream/WelcomeCard.svelte';
	import { ImmichMemories } from '$lib/components/memories/immich-memories.svelte';
	import { todoBand } from '$lib/todos/household';
	import { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import { keptTicks } from '$lib/todos/kept-ticks.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { isNarrowed, NO_FILTER, streamFilterHref } from '$lib/stream/filter';
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
			days: streamDays(i18n, data.stream, now, data.timeZone),
			when: (at: number) => streamTime(i18n, at, now, data.timeZone)
		};
	});
	const days = $derived(stream.days);
	/** Who did what a stream row reports: the actor, or *You*. */
	const who = (item: { mine: boolean; actor: { name: string } }) =>
		item.mine ? t('home.you') : item.actor.name;

	let hintDismissed = $state(false);

	const filtered = $derived(isNarrowed(data.filter));

	// Below `lg` the page is one column: heading, capture field, then either the rail and the
	// stream or the stream and the rail — the rail earns the place above the stream only while
	// a date is close (`railFirst`, docs/05 §5.5). The capture field stays on top either way.
	const RAIL_BEFORE_STREAM = 'max-lg:order-2';
	const RAIL_AFTER_STREAM = 'max-lg:order-4';
	const railOrder = $derived(data.railFirst ? RAIL_BEFORE_STREAM : RAIL_AFTER_STREAM);

	// The *To-dos* band (docs/02 §2.26.6): a row just ticked stays, struck through, while its
	// toast stands, as on the person's card.
	const justDone = new JustDoneTodos<PageData['todos'][number]>(useRemovals());
	const band = $derived(todoBand(justDone.rows(data.todos), data.today));
	const ticksKept = $derived(keptTicks());
	// *On this day* from Immich (docs/02 §2.12.1), asked for once Home is drawn; without Immich it
	// stays idle and empty.
	const immichMemories = new ImmichMemories();
	$effect(() => {
		if (!data.immichLibrary) return;
		// The teardown forgets the day, so a late answer for it is dropped.
		return immichMemories.load(data.today);
	});
	const hasMemories = $derived(!data.memories.empty || immichMemories.years.length > 0);
	/** The rail stands while a date, a to-do or a memory is close; without any it is absent. */
	const hasRail = $derived(data.upcoming.length > 0 || band.rows.length > 0 || hasMemories);

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
</script>

<svelte:head><title>{t('home.title')}</title></svelte:head>

{#snippet composer()}
	{#key `${data.draft}:${editing?.command.id ?? ''}`}
		<MomentComposer
			candidates={data.people}
			tags={data.entryTags}
			immichLibrary={data.immichLibrary}
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

<!-- From lg the rail's 17 rem column is there only while a date or a to-do is close; otherwise the stream
     takes the width (docs/05 §5.5). One class either way, never a static and a toggled one. -->
<main
	class="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 md:px-6 md:py-10 lg:grid-rows-[auto_auto_1fr] {hasRail
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
				<ComposeSheet onclose={closeSheet}>{@render composer()}</ComposeSheet>
			{:else}
				<!-- The pencil in the tab bar writes; the top of a phone's Home finds a person. -->
				<PersonFinder people={data.people} />
			{/if}
		</div>

		<KeptList people={data.people} onedit={edit} />
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
					href={contactSectionPath(
						data.linkSuggestion.a.id,
						'relationships',
						`relate=${data.linkSuggestion.b.id}`
					)}
				>
					{t('home.link.confirm')}
				</Button>
				<Button variant="ghost" size="sm" href="/" onclick={() => (hintDismissed = true)}>
					{t('home.link.notNow')}
				</Button>
			</div>
		{/if}

		{#if days.length || filtered}
			<StreamFilter
				filter={data.filter}
				members={data.members}
				userId={data.user.id}
				tagChips={data.tagChips}
				tagLine={data.tagLine}
			/>
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
							<!-- A moment's row is the target of *Moment saved · Show* (`saved-moment.ts`). -->
							<article
								id={item.kind === 'moment' ? savedMomentAnchor(item.id) : undefined}
								class="stream-row group grid grid-cols-[32px_1fr] gap-3 rounded-app px-2.5 py-2.5 transition-colors hover:bg-card"
							>
								{#if item.kind === 'moment'}
									<StreamMoment {item} members={data.members} when={stream.when(item.at)} />
								{:else if item.kind === 'person'}
									<StreamPersonAdded
										{item}
										who={who(item)}
										time={stream.when(item.at)}
										members={data.members}
									/>
								{:else if item.kind === 'interaction'}
									<StreamInteraction
										{item}
										who={who(item)}
										time={stream.when(item.at)}
										members={data.members}
									/>
								{:else if item.kind === 'circlePhoto'}
									<StreamCirclePhoto {item} who={who(item)} time={stream.when(item.at)} />
								{:else if item.kind === 'notice'}
									<StreamNotice
										content={item.content}
										who={who(item)}
										time={stream.when(item.at)}
										readerId={data.user.id}
										canOpen={(id) => peopleIds.has(id)}
									/>
								{:else}
									<StreamRelationship
										{item}
										who={who(item)}
										time={stream.when(item.at)}
										members={data.members}
									/>
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

	<!-- The rail: what is to do, what is coming up, and what happened on this day in earlier years. It is absent when nothing is, because a box
     that is permanently empty teaches people to stop looking at it; from lg its column goes with
     it, and the stream takes the width rather than leave a quarter of the screen blank. -->
	{#if hasRail}
		<HomeRail
			class={railOrder}
			{band}
			today={data.today}
			{justDone}
			{ticksKept}
			todoTickError={form && 'todoTickError' in form ? (form.todoTickError ?? null) : null}
			upcoming={data.upcoming}
			memories={data.memories}
			{immichMemories}
			{hasMemories}
		/>
	{/if}
</main>
