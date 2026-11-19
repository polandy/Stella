<script lang="ts">
	import PlanListRow from '$lib/components/plans/PlanListRow.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { planListGroups, type PlanGroupKey } from '$lib/plans/list';
	import { isKept } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import type { ActionData, PageData } from './$types';

	/*
	 * Every open outing idea of the household (docs/dev/02 §2.27.9): *This month*, *Soon*, *Some
	 * time*. What is more than three months ahead waits behind *Ideas beyond three months*, as on `/gifts`.
	 * A tick here is the card's tick; everything else about an idea stays on the person's card.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const t = useI18n().t;
	const removals = useRemovals();

	let showLater = $state(false);
	const shown = $derived(data.plans.filter((p) => !removals.isPending(removalKey('plan', p.id))));
	const listed = $derived(planListGroups(shown, data.today, showLater));
	const keptTicks = $derived(
		new Set(
			outbox.mine.flatMap((item) =>
				isKept(item, 'plan.done') ? [item.command.payload.planId] : []
			)
		)
	);

	const HEADING = {
		thisMonth: 'plans.list.thisMonth',
		later: 'plans.list.later',
		someTime: 'plans.list.someTime'
	} as const satisfies Record<PlanGroupKey, string>;
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('plans.list.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-10">
	<header class="flex flex-col gap-1">
		<h1 class="flex items-baseline gap-2 text-2xl font-semibold text-fg">
			{t('plans.list.title')}
			{#if shown.length > 0}
				<span class="text-sm font-normal text-fg-muted" data-testid="plan-list-open"
					>{t('plans.list.open', { count: shown.length })}</span
				>
			{/if}
		</h1>
		<p class="text-sm text-fg-muted">{t('plans.list.intro')}</p>
	</header>

	<FormError message={form?.planTickError ?? null} />

	{#each listed.groups as group (group.key)}
		<section
			class="rounded-app bg-card px-4 py-3 shadow-card"
			aria-labelledby="plan-list-{group.key}"
			data-testid="plan-list-group"
		>
			<h2
				id="plan-list-{group.key}"
				class="flex items-baseline gap-2 text-sm font-semibold text-fg"
			>
				{t(HEADING[group.key])}
				<span class="text-xs font-normal text-fg-muted">{group.plans.length}</span>
			</h2>
			<ul class="mt-1">
				{#each group.plans as plan (plan.id)}
					<PlanListRow {plan} today={data.today} kept={keptTicks.has(plan.id)} />
				{/each}
			</ul>
		</section>
	{/each}

	{#if listed.hidden > 0}
		<button
			type="button"
			class="inline-flex items-center gap-1 self-start text-sm font-medium text-link hover:underline"
			aria-pressed={showLater}
			onclick={() => (showLater = !showLater)}
			data-testid="plan-list-later"
		>
			<Icon name={showLater ? 'collapse' : 'expand'} size={14} />{t('plans.list.laterToggle', {
				count: listed.hidden
			})}
		</button>
		{#if listed.groups.length === 0}
			<p class="text-sm text-fg-muted" data-testid="plan-list-all-later">
				{t('plans.list.allLater')}
			</p>
		{/if}
	{:else if listed.groups.length === 0}
		<EmptyState icon="explore" title={t('plans.list.empty')} hint={t('plans.list.emptyHint')} />
	{/if}
</main>
