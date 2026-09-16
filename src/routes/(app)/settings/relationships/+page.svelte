<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KinSuggestions from '$lib/components/KinSuggestions.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { answerKey } from '$lib/relationships/answer-key';
	import { allSent, answeredCount, type AnsweredClaims } from '$lib/relationships/answered';
	import { REVIEW_PARAM, QUERY_PARAM, reviewHref } from '$lib/relationships/review-url';
	import { PEOPLE_PER_PAGE } from '$lib/suggestions/paging';
	import type { ActionData, PageData } from './$types';

	/*
	 * The household-wide relationship review (docs/02 §2.4.1,
	 * docs/concepts/relationship-suggestions.md §6.6; folded for scale in
	 * `docs/concepts/relationship-review-at-scale.html`).
	 *
	 * The rows are the person page's rows — one component for every place a suggestion is
	 * answered, so a household does not have to learn the same question twice. What this screen
	 * adds is the grouping and the folds: a page of people, five claims per person with the rest
	 * one link away on their profile, and the declined log behind its own address once it has
	 * outgrown a drawer.
	 *
	 * The counts in the header describe the household and the range describes the page. They sit
	 * next to each other on purpose — the reader should be able to see both how much work is
	 * left and where in it they are — and the route is what keeps them apart.
	 *
	 * Every control is a form or a link, so the whole screen works with no JavaScript at all.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const t = useTranslate();

	/** Claims folded away in a group, and therefore only readable on that person's own page. */
	const foldedAway = (group: { suggestions: unknown[]; totalSuggestions: number }) =>
		group.totalSuggestions - group.suggestions.length;

	/*
	 * Claims answered during this visit, shared with every block on the page.
	 *
	 * The header counts the household, and an answer held in its undo window has already left
	 * the list as far as the reader is concerned — so the count follows it down immediately and
	 * comes back up if it is taken back. Waiting for the window to close would leave the screen
	 * stating a number nobody can see any more.
	 */
	let answered = $state<AnsweredClaims>({});
	const keyOf = (s: { relation: 'parent' | 'sibling'; fromId: string; toId: string }) =>
		answerKey(s.relation, s.fromId, s.toId);

	const answeredHere = $derived(answeredCount(answered));
	const openNow = $derived(Math.max(0, data.openCount - answeredHere));

	/**
	 * A person leaves the page once every claim of theirs on it has been answered *and sent* —
	 * never merely answered, or an undo would take the whole card away with the row it restored.
	 * A folded group keeps claims this page never showed, so it is never finished here.
	 */
	const finished = (group: {
		suggestions: { relation: 'parent' | 'sibling'; fromId: string; toId: string }[];
		totalSuggestions: number;
	}) =>
		group.totalSuggestions === group.suggestions.length &&
		allSent(answered, group.suggestions.map(keyOf));

	const peopleNow = $derived(
		Math.max(0, data.peopleCount - data.groups.filter((g) => finished(g)).length)
	);
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.relationships.title')}</h1>
		<p class="text-fg-muted">{t('settings.relationships.intro')}</p>
	</header>

	{#if form?.error}
		<p class="rounded-app bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
	{/if}

	{#if !data.open}
		<EmptyState
			icon="people"
			title={t('settings.relationships.idle')}
			hint={t('settings.relationships.idleHint')}
		>
			<Button variant="primary" icon="search" href={reviewHref()}>
				{t('settings.relationships.check')}
			</Button>
		</EmptyState>
	{:else if data.log}
		<!--
			Fold 3: the declined log on its own page. It is history rather than work, so it leaves
			the list as soon as it stops fitting in a drawer (§6.4 keeps the way back on every row).
		-->
		<div class="flex flex-col gap-1">
			<h2 class="text-lg font-semibold text-fg">{t('settings.relationships.declinedHeading')}</h2>
			<p class="text-sm text-fg-muted">{t('settings.relationships.declinedBlurb')}</p>
		</div>

		<KinSuggestions
			suggestions={data.declined}
			nameOfMember={(id) => data.memberNames[id] ?? null}
			returnTo={data.returnTo}
			declinedOpen
		/>

		{#if data.matched > 0}
			<nav class="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
				{#if data.previous}
					<Button variant="ghost" size="sm" icon="back" href={data.previous}>
						{t('settings.relationships.previousPage')}
					</Button>
				{/if}
				<p class="text-sm text-fg-muted tabular-nums">
					{t('settings.relationships.answerRange', {
						from: data.from,
						to: data.to,
						total: data.matched
					})}
				</p>
				{#if data.next}
					<Button variant="ghost" size="sm" href={data.next} class="ml-auto">
						{t('settings.relationships.nextPage')}
					</Button>
				{/if}
			</nav>
		{/if}

		<a href={reviewHref()} class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="back" size={12} />{t('settings.relationships.backToList')}
		</a>
	{:else}
		<!--
			The household's totals, never the page's: what is open, and across how many people.
			The range below the list says where in it the reader is.
		-->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-fg-muted tabular-nums">
				{t('settings.relationships.openAcross', {
					claims: openNow,
					people: peopleNow
				})}
			</p>
			<Button variant="ghost" size="sm" icon="search" href={reviewHref()}>
				{t('settings.relationships.checkAgain')}
			</Button>
		</div>

		<!--
			Filtering happens over the computed groups, so arriving with a name in mind never costs
			a second rule pass. A GET form: the search ends up in the URL like every other fold.
		-->
		<form method="GET" action="/settings/relationships" class="flex flex-wrap items-center gap-2">
			<input type="hidden" name={REVIEW_PARAM} value="" />
			<label class="sr-only" for="review-search">{t('settings.relationships.findPerson')}</label>
			<input
				id="review-search"
				name={QUERY_PARAM}
				type="search"
				value={data.query}
				placeholder={t('settings.relationships.findPerson')}
				class="min-w-0 flex-1 rounded-app border border-border bg-card px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle"
			/>
			<Button variant="ghost" size="sm">{t('settings.relationships.searchSubmit')}</Button>
			{#if data.query}
				<Button variant="ghost" size="sm" href={reviewHref()}>
					{t('settings.relationships.clearSearch')}
				</Button>
			{/if}
		</form>

		{#if data.groups.length === 0}
			<p class="rounded-app bg-card p-4 text-sm text-fg-muted shadow-card">
				{data.query
					? t('settings.relationships.noMatch', { query: data.query })
					: t('settings.relationships.nothing')}
			</p>
		{:else}
			{#each data.groups.filter((g) => !finished(g)) as group (group.subjectId)}
				<section class="flex flex-col gap-2 rounded-app bg-card p-4 shadow-card">
					<a
						href="/contacts/{group.subjectId}#relationships"
						class="flex items-center gap-3 text-fg hover:underline"
					>
						<Avatar name={group.subjectName} id={group.subjectId} size={32} />
						<span class="font-medium">{group.subjectName}</span>
					</a>
					<KinSuggestions suggestions={group.suggestions} returnTo={data.returnTo} bind:answered />

					<!--
						Fold 2: one imported family can leave dozens of claims about a single person.
						The number is named rather than hidden behind a bare *more*, and the way
						through is their own review panel — one screen, reached two ways.
					-->
					{#if foldedAway(group) > 0}
						<div
							class="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-bg-sunken px-3 py-2 text-sm text-fg-muted"
							data-testid="kin-folded"
						>
							<span class="tabular-nums">
								{t('settings.relationships.moreForPerson', {
									count: foldedAway(group),
									name: group.subjectName
								})}
							</span>
							<Button
								variant="ghost"
								size="sm"
								href="/contacts/{group.subjectId}?review#relationships"
								class="ml-auto"
							>
								{t('settings.relationships.openAll', { count: group.totalSuggestions })}
							</Button>
						</div>
					{/if}
				</section>
			{/each}
		{/if}

		<!--
			Fold 1: the pager. Its cursor is a person rather than an offset, because the list
			shrinks while it is answered and an offset would step over whatever slid up into the gap.
		-->
		{#if data.matched > 0}
			<nav
				class="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4"
				data-testid="kin-pager"
			>
				{#if data.previous}
					<Button variant="ghost" size="sm" icon="back" href={data.previous}>
						{t('settings.relationships.previousPeople', { count: PEOPLE_PER_PAGE })}
					</Button>
				{/if}
				<p class="text-sm text-fg-muted tabular-nums">
					{t('settings.relationships.peopleRange', {
						from: data.from,
						to: data.to,
						total: data.matched
					})}
				</p>
				{#if data.next}
					<Button variant="primary" size="sm" href={data.next} class="ml-auto">
						{t('settings.relationships.nextPeople', { count: PEOPLE_PER_PAGE })}
					</Button>
				{/if}
			</nav>
		{/if}

		<!--
			What the household has already turned down: one disclosure away while it is small, and
			its own page once it is not — a *no* is never a silent permanent veto (§6.4).
		-->
		{#if data.declinedCount > 0}
			{#if data.declinedInline}
				<KinSuggestions
					suggestions={data.declined}
					nameOfMember={(id) => data.memberNames[id] ?? null}
					returnTo={data.returnTo}
				/>
			{:else}
				<a
					href={reviewHref({ declined: true })}
					class="flex items-center gap-1 text-sm text-link hover:underline"
					data-testid="kin-declined-link"
				>
					{t('settings.relationships.declinedLog', { count: data.declinedCount })}
					<Icon name="forward" size={12} />
				</a>
			{/if}
		{/if}
	{/if}
</main>
