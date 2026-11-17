<script lang="ts">
	import { browser } from '$app/environment';
	import KeptItem from '$lib/components/pwa/KeptItem.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import { deviceDay, writersDay } from '$lib/dates/today';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { cardShape } from '$lib/people/empty-cards';
	import { datesEditorPath } from '$lib/people/identity-card';
	import { sectionAnchor } from '$lib/people/sections';
	import type { MomentDraft } from '$lib/people/story-forms';
	import { momentDraftOf } from '$lib/plans/afterwards';
	import { openIdeaCount, splitPlans, type PlanTab } from '$lib/plans/card';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { birthOf } from '$lib/when/resolve';
	import { planAddCommand } from './plan-add-command';
	import PlanForm from './PlanForm.svelte';
	import PlanRow from './PlanRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The Outings card (docs/dev/02 §2.27): what the household wants to do with this person. *Ideas*
	 * holds the open and booked ones, those more than three months ahead folded under *Later*;
	 * *Done* what was done. With nothing noted the card is one line (docs/dev/05 §5.5), and says
	 * what it is for, since a to-do and an outing are easy to confuse.
	 */
	let {
		data,
		form,
		writeMoment
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Opens the story's composer on this draft (docs/dev/02 §2.27.8). */
		writeMoment: (draft: MomentDraft) => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const c = $derived(data.contact);
	// The writer's day, as the story's forms take it.
	const today = $derived(writersDay(data.today, browser ? deviceDay() : null));

	// An idea on its way out (docs/dev/02 §2.23) is gone from the card while its undo window is open.
	const shown = $derived(data.plans.filter((p) => !removals.isPending(removalKey('plan', p.id))));
	const birth = $derived(birthOf(c));
	const estimateHref = $derived(datesEditorPath(c.id));
	const lists = $derived(splitPlans(shown, birth, data.today));

	/** Ideas noted here while Stella was out of reach (docs/dev/02 §2.18), until they are sent. */
	const kept = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'plan.add'> =>
				isKept(item, 'plan.add') && item.command.payload.contactId === c.id
		)
	);
	/** Bookings and ticks taken here while out of reach, by idea, until they are sent. */
	const keptSteps = $derived(
		new Map<string, 'book' | 'done'>(
			outbox.mine.flatMap((item): [string, 'book' | 'done'][] =>
				isKept(item, 'plan.done')
					? [[item.command.payload.planId, 'done']]
					: isKept(item, 'plan.book')
						? [[item.command.payload.planId, 'book']]
						: []
			)
		)
	);
	const holdsSomething = $derived(shown.length > 0 || kept.length > 0);
	const line = $derived(cardShape('plans', holdsSomething) === 'line');

	let tab = $state<PlanTab>('ideas');
	let unfolded = $state(false);
	let open = $state(false);
	const closeAdding = () => (open = false);

	// Noting an idea saves through the outbox, keeping it when Stella cannot take it (§2.18).
	const keepPlan = $derived(
		keepable(
			{
				toCommand: (formData, id) => planAddCommand(formData, id, c.id, Date.now()),
				about: c.displayName,
				errorKey: 'planError',
				onApplied: () => {
					removals.notify(t('components.saved'));
					tab = 'ideas';
					closeAdding();
				},
				onKept: closeAdding
			},
			savedEnhance(removals, t('components.saved'), closeAdding)
		)
	);

	// Read when asked, after the tick's reload, so the moment starts on the day Stella recorded.
	function momentAbout(planId: string) {
		const plan = data.plans.find((p) => p.id === planId);
		if (plan) writeMoment(momentDraftOf(plan, today));
	}

	const rowError = (planId: string): string | null =>
		form?.planRowError && form.planRowError.planId === planId ? form.planRowError.message : null;
</script>

{#snippet rows(list: PersonPageData['plans'], testid: string)}
	<ul class="flex flex-col" data-testid={testid}>
		{#each list as plan (plan.id)}
			<PlanRow
				{plan}
				contactId={c.id}
				{today}
				{birth}
				{estimateHref}
				name={c.displayName}
				personIsMember={data.recipientIsMember}
				kept={keptSteps.get(plan.id) ?? null}
				error={rowError(plan.id)}
				writeMoment={momentAbout}
			/>
		{/each}
	</ul>
{/snippet}

<Section
	id={sectionAnchor('plans')}
	title={t('plans.title')}
	addLabel={t('plans.add')}
	empty={line ? t('plans.none') : undefined}
	error={form?.planError ?? null}
	bind:open
>
	<FormError message={form?.planTickError ?? null} variant="inline" />

	{#if kept.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-plans">
			{#each kept as item (item.command.id)}
				<li>
					<KeptItem {item}>
						<p class="mt-1 text-fg">{item.command.payload.title}</p>
					</KeptItem>
				</li>
			{/each}
		</ul>
	{/if}

	{#if shown.length > 0}
		{@const counts = { ideas: openIdeaCount(lists.open), done: lists.done.length }}
		<Tabs
			tabs={['ideas', 'done'] as const}
			chosen={tab}
			onchoose={(next) => (tab = next)}
			label={t('plans.tabs.label')}
			idPrefix="plan-tab"
			panel="plan-panel"
			class="mb-2"
		>
			{#snippet content(which)}
				{t(`plans.tab.${which}`)}{#if counts[which] > 0}<span class="tabular-nums"
						>{` · ${counts[which]}`}</span
					>{/if}
			{/snippet}
		</Tabs>

		<div role="tabpanel" id="plan-panel" aria-labelledby="plan-tab-{tab}" data-tab={tab}>
			{#if tab === 'ideas'}
				{#if lists.open.length > 0}
					{@render rows(lists.open, 'plan-ideas')}
				{:else if lists.later.length > 0}
					<p class="py-2 text-sm text-fg-muted">{t('when.allWaiting')}</p>
				{:else}
					<p class="py-2 text-sm text-fg-muted">
						{t('plans.ideas.empty', { name: c.displayName })}
					</p>
				{/if}
				{#if lists.later.length > 0}
					<button
						type="button"
						class="mt-2 inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase hover:text-fg"
						aria-expanded={unfolded}
						onclick={() => (unfolded = !unfolded)}
						data-testid="plan-later"
					>
						<Icon name={unfolded ? 'collapse' : 'expand'} size={12} />{t('when.fold', {
							count: lists.later.length
						})}
					</button>
					{#if unfolded}
						<div class="opacity-80">{@render rows(lists.later, 'plan-waiting')}</div>
					{/if}
				{/if}
			{:else if lists.done.length > 0}
				{@render rows(lists.done, 'plan-done-list')}
			{:else}
				<p class="py-2 text-sm text-fg-muted">{t('plans.done.empty')}</p>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		{#if line}
			<p class="mt-1 text-xs text-fg-subtle" data-testid="plans-help">{t('plans.help')}</p>
		{/if}
	{/snippet}

	{#snippet editor()}
		<PlanForm
			heading={t('plans.form.for', { name: c.displayName })}
			action="?/addPlan"
			submit={keepPlan}
			{today}
			{birth}
			{estimateHref}
			canChooseVisibility
			person={data.recipientIsMember ? c.displayName : null}
		/>
	{/snippet}
</Section>
