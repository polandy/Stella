<script lang="ts">
	import { enhance } from '$app/forms';
	import PlanStep from '$lib/components/person/PlanStep.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { nextYearWhen } from '$lib/plans/home';
	import { passedPlanLabel, planDayLabel } from '$lib/plans/home-labels';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { WHEN_FIELDS } from '$lib/when/form';
	import type { PageData } from '../../../routes/(app)/$types';

	/*
	 * An outing idea in Home's *Coming up* (docs/dev/02 §2.27.7): what, with whom, when. One whose
	 * day went by asks *Done? Still on?* for a week: done, next year, keep without a date, or delete.
	 */
	interface Props {
		row: PageData['plans']['coming'][number];
		asks: boolean;
		today: string;
		/** The refusal of this row's last answer, if any. */
		error: string | null;
	}
	let { row, asks, today, error }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const plan = $derived(row.plan);
	const when = $derived(plan.when!);
	const next = $derived(nextYearWhen(when));
	const saved = savedEnhance(removals, t('components.saved'));
	const planHref = $derived(contactSectionPath(plan.contactId, 'plans'));
</script>

<Avatar id={plan.contactId} name={plan.contactName} avatarPhotoId={plan.avatarPhotoId} size={28} />
<div class="min-w-0 text-[13px] leading-snug text-fg-muted">
	<a href={planHref} class="font-semibold text-fg hover:underline">{plan.title}</a>
	{#if plan.visibility === 'private'}
		<span class="inline-flex items-center align-middle" title={t('common.onlyYouSee')}
			><Icon name="private" size={11} label={t('common.privateInline')} /></span
		>
	{:else if plan.hiddenFromPerson}
		<span
			class="inline-flex items-center align-middle"
			title={t('plans.hiddenFrom', { name: plan.contactName })}
			><Icon
				name="surprise"
				size={11}
				label={t('plans.hiddenFrom', { name: plan.contactName })}
			/></span
		>
	{/if}
	<span class="flex flex-wrap items-center gap-x-1 text-xs text-fg-subtle">
		<span class="inline-flex items-center gap-1"
			><Icon name="explore" size={11} label={t('home.plan')} /><a
				href="/contacts/{plan.contactId}"
				class="hover:underline">{t('home.planWith', { name: plan.contactName })}</a
			></span
		>
		<span aria-hidden="true">·</span>
		<span data-testid="coming-up-plan-when"
			>{asks ? passedPlanLabel(i18n, when, row, today) : planDayLabel(i18n, when, row, today)}</span
		>
	</span>
	{#if asks}
		<div
			role="group"
			aria-label={t('home.planAsk.group', { title: plan.title })}
			class="mt-1.5 flex flex-col gap-2 rounded-control bg-warning-soft p-2.5"
			data-testid="plan-ask"
		>
			<p class="text-xs text-fg">{t('home.planAsk')}</p>
			<div class="flex flex-wrap items-center gap-2">
				<PlanStep
					plan={{ id: plan.id, title: plan.title }}
					contactId={plan.contactId}
					step="done"
					kept={false}
					label={t('home.planAsk.done')}
				/>
				{#if next}
					<form method="POST" action="?/answerPlanWhen" use:enhance={saved}>
						<input type="hidden" name="planId" value={plan.id} />
						<input type="hidden" name="contactId" value={plan.contactId} />
						<input type="hidden" name={WHEN_FIELDS.kind} value={next.kind} />
						{#if next.kind === 'at_age'}
							<input type="hidden" name={WHEN_FIELDS.age} value={next.age} />
						{:else if next.kind === 'on_date' || next.kind === 'in_month'}
							<input type="hidden" name={WHEN_FIELDS.on} value={next.on} />
						{/if}
						<Button variant="secondary" size="sm" data-testid="plan-next-year"
							>{t('home.planAsk.nextYear')}</Button
						>
					</form>
				{/if}
				<form method="POST" action="?/answerPlanWhen" use:enhance={saved}>
					<input type="hidden" name="planId" value={plan.id} />
					<input type="hidden" name="contactId" value={plan.contactId} />
					<input type="hidden" name={WHEN_FIELDS.kind} value="now" />
					<Button variant="secondary" size="sm" data-testid="plan-undated"
						>{t('home.planAsk.undated')}</Button
					>
				</form>
				<RemoveButton
					kind="plan"
					id={plan.id}
					action="?/removePlan"
					fields={{ planId: plan.id, contactId: plan.contactId }}
					label={t('home.planAsk.remove')}
					removed={t('plans.removed')}
					spelled
				/>
			</div>
			<FormError message={error} variant="inline" />
		</div>
	{/if}
</div>
