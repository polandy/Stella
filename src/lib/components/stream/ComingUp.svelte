<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { occasionLabel, whenLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import { glide } from '$lib/motion/motion.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { comingUpFirst, comingUpRows } from '$lib/plans/home';
	import { passedPlanLabel, planDayLabel } from '$lib/plans/home-labels';
	import { railSummary } from '$lib/stream/rail-summary';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import type { PageData } from '../../../routes/(app)/$types';
	import ComingUpPlan from './ComingUpPlan.svelte';
	import RailSection from './RailSection.svelte';

	/*
	 * Home's *Coming up* (docs/dev/02 §2.13): the birthdays and anniversaries close ahead, each with
	 * *Write a moment*, the gift ideas noted for it and what is bought and ready (§2.25.9), in the
	 * rail beside or above the stream; the dated outing ideas sorted in among them (§2.27.7).
	 */
	interface Props {
		upcoming: PageData['upcoming'];
		plans: PageData['plans'];
		today: string;
		/** The refusal of a passed idea's answer, by its id. */
		planRowError: { planId: string | null; message: string } | null;
		/** The refusal of a *Done* that could not be kept. */
		planTickError: string | null;
	}
	let { upcoming, plans, today, planRowError, planTickError }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const rows = $derived(
		comingUpRows(
			upcoming,
			plans.asking.filter((row) => !removals.isPending(removalKey('plan', row.plan.id))),
			plans.coming.filter((row) => !removals.isPending(removalKey('plan', row.plan.id)))
		)
	);

	// One vertical list at every width — beside the stream from lg, above or below it on a
	// phone. Nothing scrolls sideways, so nothing hides off the right edge.
	const LIST = 'flex flex-col';
	const ROW =
		'grid grid-cols-[28px_1fr] gap-2.5 rounded-app px-1.5 py-1.5 transition-colors hover:bg-card';
	// A row that asks is tall; its avatar stays by the title rather than float to its middle.
	// A phone shows the first few rows and keeps the rest one tap away; from lg the whole list
	// is there (docs/dev/05 §5.5).
	const CAP = 3;
	const OVERFLOW = 'max-lg:hidden';
	let showAll = $state(false);
	// A passed idea asks for a week only, so it is never folded away; the cap counts the rest.
	const asking = $derived(rows.filter((row) => row.kind === 'ask').length);

	/** The folded line on a phone: *3 · Mia turns 7 · on Saturday* (docs/dev/05 §5.5.1). */
	// It never names a private idea nor a surprise, as a phone's folded line is read in passing.
	const summary = $derived.by(() => {
		const first = comingUpFirst(rows);
		if (!first) return railSummary(rows.length, null);
		if (first.kind === 'date') {
			const { date } = first;
			const when = whenLabel(i18n, date.daysUntil, date.date);
			return railSummary(rows.length, `${date.contactName} ${occasionLabel(i18n, date)} · ${when}`);
		}
		const when = first.plan.when!;
		const day =
			first.kind === 'ask'
				? passedPlanLabel(i18n, when, first, today)
				: planDayLabel(i18n, when, first, today);
		return railSummary(rows.length, `${first.plan.title} · ${day}`);
	});
	const rowKey = (row: (typeof rows)[number]) =>
		row.kind === 'date'
			? row.date.contactId + row.date.date + row.date.kind
			: `plan:${row.plan.id}`;
</script>

<RailSection icon="calendar" title={t('home.comingUp')} {summary} testid="coming-up">
	<!-- *Show all* opens the rest of the list in place (docs/dev/05 §5.11). -->
	<ul class={LIST} use:glide={{ key: showAll }}>
		{#each rows as row, i (rowKey(row))}
			<li
				class="{ROW} {row.kind === 'ask' ? 'items-start' : 'items-center'} {i - asking >= CAP &&
				!showAll
					? OVERFLOW
					: ''}"
			>
				{#if row.kind !== 'date'}
					<ComingUpPlan
						{row}
						asks={row.kind === 'ask'}
						{today}
						error={planRowError?.planId === row.plan.id ? planRowError.message : null}
					/>
				{:else}
					{@const item = row.date}
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
							<!-- A line of its own height on a touch screen, so the name above stays
							     its own target (docs/dev/05 §5.9). -->
							<a
								href="/?about={item.contactId}"
								class="text-link hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-6 pointer-coarse:items-center"
								>{t('home.writeMoment')}</a
							>
						</span>
						{#if item.giftIdeas > 0}
							<!-- The occasion is the moment an idea was noted for (docs/dev/02 §2.13.3). -->
							<a
								href={contactSectionPath(item.contactId, 'gifts')}
								class="mt-0.5 inline-flex items-center gap-1 text-xs text-link hover:underline"
								aria-label={t('home.giftIdeasFor', {
									count: item.giftIdeas,
									name: item.contactName
								})}
								data-testid="coming-up-gift-ideas"
								><Icon name="gift" size={12} />{t('home.giftIdeas', {
									count: item.giftIdeas
								})}</a
							>
						{/if}
						{#if item.readyGifts.length > 0}
							<a
								href={contactSectionPath(item.contactId, 'gifts')}
								class="mt-0.5 flex items-center gap-1 text-xs text-fg-muted hover:underline"
								data-testid="coming-up-ready"
								><Icon name="bought" size={12} /><span class="truncate"
									>{t('home.ready', { titles: item.readyGifts.join(', ') })}</span
								></a
							>
						{/if}
						{#if item.bookedPlans.length > 0}
							<a
								href={contactSectionPath(item.contactId, 'plans')}
								class="mt-0.5 flex items-center gap-1 text-xs text-fg-muted hover:underline"
								data-testid="coming-up-booked"
								><Icon name="explore" size={12} /><span class="truncate"
									>{t('home.planBooked', { titles: item.bookedPlans.join(', ') })}</span
								></a
							>
						{/if}
						{#if item.planIdeas > 0}
							<a
								href={contactSectionPath(item.contactId, 'plans')}
								class="mt-0.5 inline-flex items-center gap-1 text-xs text-link hover:underline"
								aria-label={t('home.planIdeasFor', {
									count: item.planIdeas,
									name: item.contactName
								})}
								data-testid="coming-up-plan-ideas"
								><Icon name="explore" size={12} />{t('home.planIdeas', {
									count: item.planIdeas
								})}</a
							>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	<FormError message={planTickError} variant="inline" />
	{#if rows.length - asking > CAP && !showAll}
		<button
			type="button"
			class="self-start px-1.5 pt-1.5 text-xs font-medium text-link hover:underline lg:hidden"
			onclick={() => (showAll = true)}
		>
			{t('home.showAll', { count: rows.length })}
		</button>
	{/if}
</RailSection>
