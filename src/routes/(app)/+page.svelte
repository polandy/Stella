<script lang="ts">
	import { goto } from '$app/navigation';
	import { MediaQuery } from 'svelte/reactivity';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MomentComposer from '$lib/components/MomentComposer.svelte';
	import { agoLabel, occasionLabel, whenLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { relationshipRowLabel } from '$lib/relationships/labels';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;

	function ago(ms: number): string {
		const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
		if (s < 60) return t('home.justNow');
		if (s < 3600) return t('home.minutesAgo', { minutes: Math.floor(s / 60) });
		if (s < 86400) return t('home.hoursAgo', { hours: Math.floor(s / 3600) });
		if (s < 604800) return t('home.daysAgo', { days: Math.floor(s / 86400) });
		return t('home.weeksAgo', { weeks: Math.floor(s / 604800) });
	}

	function dayLabel(ms: number): string {
		const d = new Date(ms);
		const today = new Date();
		const diff = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
		if (diff === 0) return t('home.today');
		if (diff === 1) return t('home.yesterday');
		return d.toLocaleDateString(i18n.intlLocale, { weekday: 'long', day: 'numeric', month: 'long' });
	}

	// Group the newest-first stream by calendar day.
	const days = $derived.by(() => {
		const groups: { label: string; items: PageData['stream'] }[] = [];
		for (const item of data.stream) {
			const label = dayLabel(item.at);
			let g = groups.at(-1);
			if (!g || g.label !== label) {
				g = { label, items: [] };
				groups.push(g);
			}
			g.items.push(item);
		}
		return groups;
	});

	let hintDismissed = $state(false);

	// The rail's rows: one vertical list at every width — beside the stream from lg, above or
	// below it on a phone. Nothing scrolls sideways, so nothing hides off the right edge.
	const RAIL_LIST = 'flex flex-col';
	const RAIL_ROW =
		'grid grid-cols-[28px_1fr] items-center gap-2.5 rounded-app px-1.5 py-1.5 transition-colors hover:bg-card';

	// A phone shows the first few rows of a band and keeps the rest one tap away, so two full
	// bands never push the stream off the screen; from lg the whole band is there (docs/05 §5.5).
	const RAIL_CAP = 3;
	const RAIL_OVERFLOW = 'max-lg:hidden';

	// Below `lg` the page is one column: heading, capture field, then either the rail and the
	// stream or the stream and the rail — the rail earns the place above the stream only while
	// a date is close (`railFirst`, docs/05 §5.5). The capture field stays on top either way.
	const RAIL_BEFORE_STREAM = 'max-lg:order-2';
	const RAIL_AFTER_STREAM = 'max-lg:order-4';
	const railOrder = $derived(data.railFirst ? RAIL_BEFORE_STREAM : RAIL_AFTER_STREAM);

	let showAllUpcoming = $state(false);
	let showAllQuiet = $state(false);

	// On a phone the composer is a sheet over the stream, opened by the pencil in the tab bar
	// (`/?compose`) and closed by handing the URL back — so the open state lives in the URL
	// and survives a reload, and there is nothing to keep in sync with the tab bar.
	// Below `md` the composer lives in the sheet; above it, at the top of the stream. One of
	// them is mounted at a time, so there is exactly one "What happened?" field on the page.
	const phone = new MediaQuery('(width < 48rem)');
	const sheetOpen = $derived(data.compose && phone.current);
	function closeSheet() {
		void goto('/', { replaceState: true, noScroll: true });
	}
</script>

<svelte:head><title>{t('home.title')}</title></svelte:head>

{#snippet composer()}
	{#key data.draft}
		<MomentComposer
			candidates={data.candidates}
			me={{ id: data.user.id, name: data.user.name }}
			today={data.today}
			error={form?.momentError ?? null}
			draft={form?.draft ?? data.draft}
			autofocus={data.compose}
		/>
	{/key}
{/snippet}

<main class="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 md:px-6 md:py-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[auto_auto_1fr]">
<header class="lg:col-start-1 lg:row-start-1">
	<h1 class="text-2xl font-semibold text-fg">{t('home.heading')}</h1>
	<p class="text-sm text-fg-muted">{t('home.intro')}</p>
</header>

<div class="flex min-w-0 flex-col max-lg:order-1 lg:col-start-1 lg:row-start-2">

	<!-- Desktop: the composer sits at the top. Phone: a sheet over the stream (below). -->
	<div class="max-md:hidden">
		{#if !phone.current}{@render composer()}{/if}
	</div>
	<div class="md:hidden">
		{#if sheetOpen || (form?.momentError && phone.current)}
			<div class="fixed inset-0 z-30 flex flex-col justify-end" data-testid="compose-sheet">
				<button type="button" class="flex-1 bg-bg-sunken/70 backdrop-blur-sm" aria-label={t('common.close')} onclick={closeSheet}></button>
				<div class="rounded-t-app bg-bg p-3 pb-4 shadow-pop">
					<div class="mx-auto mb-2 h-1 w-10 rounded-full bg-border"></div>
					{@render composer()}
				</div>
			</div>
		{:else}
			<a href="/?compose" class="flex items-center gap-3 rounded-app bg-card px-3 py-2.5 text-sm text-fg-subtle shadow-card">
				<Avatar id={data.user.id} name={data.user.name} avatarPhotoId={null} size={28} />
				{t('home.heading')}
			</a>
		{/if}
	</div>

</div>

<div class="flex min-w-0 flex-col gap-6 max-lg:order-3 lg:col-start-1 lg:row-start-3">
	{#if data.linkSuggestion && !hintDismissed}
		<div class="flex items-center gap-3 rounded-app border border-success/35 bg-success/10 px-4 py-2.5 text-sm text-fg" role="status">
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
				href="/contacts/{data.linkSuggestion.a.id}?relate={data.linkSuggestion.b.id}#relationships"
			>
				{t('home.link.confirm')}
			</Button>
			<Button variant="ghost" size="sm" href="/" onclick={() => (hintDismissed = true)}>
				{t('home.link.notNow')}
			</Button>
		</div>
	{/if}

	{#if days.length}
		<ol class="flex flex-col" data-testid="stream">
			{#each days as day (day.label)}
				<li>
					<div class="flex items-center gap-3 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
						{day.label}<span class="h-px flex-1 bg-border"></span>
					</div>
					{#each day.items as item (item.kind + item.id)}
						<article class="grid grid-cols-[32px_1fr] gap-3 rounded-app px-2.5 py-2.5 transition-colors hover:bg-card">
							{#if item.kind === 'moment'}
								<Avatar id={item.anchor.id} name={item.anchor.name} avatarPhotoId={item.anchor.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? t('home.you') : item.actor.name}</b>
										<span>{t('home.stream.wroteIn')}</span>
										<span><a href="/contacts/{item.anchor.id}/journal" class="font-medium text-fg hover:underline">{item.anchor.name}</a>{t('home.stream.wroteInJournal')}</span>
										{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title={t('common.onlyYouSee')}><Icon name="private" size={11} />{t('common.privateInline')}</span>{/if}
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle" title={item.entryDate}>{ago(item.at)}</span>
									</div>
									<div class="note-body mt-1 text-fg">{@html item.bodyHtml}</div>
									{#if item.photoIds.length}
										<div class="mt-2 flex gap-1.5">
											{#each item.photoIds as photoId (photoId)}
												<a href="/media/{photoId}" target="_blank" rel="noreferrer" class="block overflow-hidden rounded-md border border-border">
													<img src="/media/{photoId}?thumb" alt="" loading="lazy" class="size-16 object-cover" />
												</a>
											{/each}
										</div>
									{/if}
									{#if item.mentions.length}
										<div class="mt-1.5 flex flex-wrap gap-1.5">
											{#each item.mentions as m (m.id)}
												<a href="/contacts/{m.id}" class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pl-1 pr-2 text-xs text-fg-muted hover:text-fg">
													<Avatar id={m.id} name={m.name} avatarPhotoId={m.avatarPhotoId} size={18} />{m.name}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{:else if item.kind === 'person'}
								<Avatar id={item.person.id} name={item.person.name} avatarPhotoId={item.person.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? t('home.you') : item.actor.name}</b>
										<span>{t('home.stream.added')}</span>
										<a href="/contacts/{item.person.id}" class="font-medium text-fg hover:underline">{item.person.name}</a>
										{#if t('home.stream.addedAfter')}<span>{t('home.stream.addedAfter')}</span>{/if}
										<span class="rounded bg-success/16 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-success">{t('home.stream.newPerson')}</span>
										{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title={t('common.onlyYouSee')}><Icon name="private" size={11} />{t('common.privateInline')}</span>{/if}
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle">{ago(item.at)}</span>
									</div>
									{#if item.description}<p class="mt-0.5 text-sm text-fg-muted">{item.description}</p>{/if}
								</div>
							{:else if item.kind === 'interaction'}
								{@const kind = KIND_PRESENTATION[item.interactionKind]}
								<Avatar id={item.subject.id} name={item.subject.name} avatarPhotoId={item.subject.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? t('home.you') : item.actor.name}</b>
										<span>{t('home.stream.logged')}</span>
										<span class="inline-flex items-center gap-1 font-semibold text-fg"><span style="color:{kind.accent}"><Icon name={kind.icon} size={12} /></span>{t(kind.label)}</span>
										<span>{t('home.stream.loggedWith')}</span>
										<a href="/contacts/{item.subject.id}" class="font-medium text-fg hover:underline">{item.subject.name}</a>
										{#if t('home.stream.loggedAfter')}<span>{t('home.stream.loggedAfter')}</span>{/if}
										{#if item.visibility === 'private'}<span class="inline-flex items-center gap-1 text-[11px] text-fg-subtle" title={t('common.onlyYouSee')}><Icon name="private" size={11} />{t('common.privateInline')}</span>{/if}
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle" title={item.happenedAt}>{ago(item.at)}</span>
									</div>
									{#if item.title}<p class="mt-0.5 text-sm text-fg">{item.title}</p>{/if}
									{#if item.participants.length}
										<div class="mt-1.5 flex flex-wrap gap-1.5">
											{#each item.participants as m (m.id)}
												<a href="/contacts/{m.id}" class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pl-1 pr-2 text-xs text-fg-muted hover:text-fg">
													<Avatar id={m.id} name={m.name} avatarPhotoId={m.avatarPhotoId} size={18} />{m.name}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{:else if item.kind === 'notice'}
								<!--
									The only item with nobody to link to: the person is gone, and the log
									entry is all that is left of them (docs/02 §2.2).
								-->
								<span class="grid size-8 shrink-0 place-items-center rounded-full bg-bg-sunken text-fg-subtle" aria-hidden="true">
									<Icon name="remove" size={14} />
								</span>
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? t('home.you') : item.actor.name}</b>
										<span class="font-medium text-fg">{item.summary}</span>
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle">{ago(item.at)}</span>
									</div>
								</div>
							{:else}
								<Avatar id={item.from.id} name={item.from.name} avatarPhotoId={item.from.avatarPhotoId} size={32} />
								<div class="min-w-0">
									<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
										<b class="font-semibold text-fg">{item.mine ? t('home.you') : item.actor.name}</b>
										<span>{t('home.stream.linked')}</span>
										<a href="/contacts/{item.from.id}" class="font-medium text-fg hover:underline">{item.from.name}</a>
										<span class="text-fg-subtle">→</span>
										<span>{relationshipRowLabel(t, item)}</span>
										<a href="/contacts/{item.to.id}" class="font-medium text-fg hover:underline">{item.to.name}</a>
										{#if t('home.stream.linkedAfter')}<span>{t('home.stream.linkedAfter')}</span>{/if}
										<span class="rounded bg-link/16 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-link">{t('home.stream.relationship')}</span>
										<span class="ml-auto whitespace-nowrap text-xs text-fg-subtle">{ago(item.at)}</span>
									</div>
								</div>
							{/if}
						</article>
					{/each}
				</li>
			{/each}
		</ol>
	{:else}
		<EmptyState icon="write" title={t('home.empty.title')} hint={t('home.empty.hint')} />
	{/if}
</div>

{#snippet showAll(total: number, reveal: () => void)}
	<button
		type="button"
		class="self-start px-1.5 pt-1.5 text-xs font-medium text-link hover:underline lg:hidden"
		onclick={reveal}
	>
		{t('home.showAll', { count: total })}
	</button>
{/snippet}

<!-- The rail: the future, and the people slipping out of it. Both bands are absent when
     empty, because a box that is permanently empty teaches people to stop looking at it. -->
<aside
	class="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-8 lg:self-start {railOrder}"
	aria-label={t('home.atAGlance')}
>
	{#if data.upcoming.length}
		<section data-testid="coming-up">
			<h2 class="flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
				<Icon name="calendar" size={13} />{t('home.comingUp')}
			</h2>
			<ul class="{RAIL_LIST}">
				{#each data.upcoming as item, i (item.contactId + item.date + item.kind)}
					<li class="{RAIL_ROW} {i >= RAIL_CAP && !showAllUpcoming ? RAIL_OVERFLOW : ''}">
						<Avatar id={item.contactId} name={item.contactName} avatarPhotoId={item.avatarPhotoId} size={28} />
						<div class="min-w-0 text-[13px] leading-snug text-fg-muted">
							<a href="/contacts/{item.contactId}" class="font-semibold text-fg hover:underline">{item.contactName}</a>
							<span>{occasionLabel(i18n, item)}</span>
							<span class="block text-xs text-fg-subtle">
								{whenLabel(i18n, item.daysUntil, item.date)}
								<span aria-hidden="true">·</span>
								<a href="/?about={item.contactId}" class="text-link hover:underline">{t('home.writeMoment')}</a>
							</span>
						</div>
					</li>
				{/each}
			</ul>
			{#if data.upcoming.length > RAIL_CAP && !showAllUpcoming}
				{@render showAll(data.upcoming.length, () => (showAllUpcoming = true))}
			{/if}
		</section>
	{/if}

	{#if data.quiet.length}
		<section data-testid="quiet-lately">
			<h2 class="flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
				<Icon name="quiet" size={13} />{t('home.quietLately')}
			</h2>
			<ul class="{RAIL_LIST}">
				{#each data.quiet as item, i (item.contactId)}
					<li class="{RAIL_ROW} {i >= RAIL_CAP && !showAllQuiet ? RAIL_OVERFLOW : ''}">
						<Avatar id={item.contactId} name={item.contactName} avatarPhotoId={item.avatarPhotoId} size={28} />
						<div class="min-w-0 text-[13px] leading-snug text-fg-muted">
							<a href="/contacts/{item.contactId}" class="font-semibold text-fg hover:underline">{item.contactName}</a>
							<span class="block text-xs text-fg-subtle">
								{item.lastTouchedOn
									? t('home.lastWritten', { ago: agoLabel(i18n, item.quietForDays) })
									: t('home.nothingWrittenYet')}
								<span aria-hidden="true">·</span>
								<a href="/?about={item.contactId}" class="text-link hover:underline">{t('home.writeMoment')}</a>
							</span>
						</div>
					</li>
				{/each}
			</ul>
			{#if data.quiet.length > RAIL_CAP && !showAllQuiet}
				{@render showAll(data.quiet.length, () => (showAllQuiet = true))}
			{/if}
		</section>
	{/if}
</aside>
</main>
