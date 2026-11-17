<script lang="ts">
	import PlanStep from '$lib/components/person/PlanStep.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import WhenChip from '$lib/components/when/WhenChip.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { planState } from '$lib/plans/card';
	import type { ListPlanView } from '../../../routes/(app)/_shared/household-plans';

	/*
	 * One idea on `/plans` (docs/dev/02 §2.27.9): the person's face, the line linking to their
	 * Outings card, with whom and when, and the done box on the right (docs/dev/05 §5.1).
	 */
	interface Props {
		plan: ListPlanView;
		today: string;
		/** Ticked on this device and not sent yet. */
		kept: boolean;
	}
	let { plan, today, kept }: Props = $props();

	const t = useI18n().t;
	const standing = $derived(planState(plan, plan.birth, today));
	const boxId = $derived(`plan-list-done-${plan.id}`);
</script>

<li class="flex items-start gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
	<Avatar
		id={plan.contactId}
		name={plan.contactName}
		avatarPhotoId={plan.avatarPhotoId}
		size={28}
	/>
	<div class="min-w-0 flex-1">
		<p class="flex items-center gap-1.5 font-medium break-words text-fg">
			{#if plan.visibility === 'private'}
				<Icon name="private" size={12} label={t('common.privateInline')} />
			{:else if plan.hiddenFromPerson}
				<Icon name="surprise" size={12} label={t('plans.hiddenFrom', { name: plan.contactName })} />
			{/if}
			<a href={contactSectionPath(plan.contactId, 'plans')} class="hover:underline">{plan.title}</a>
		</p>
		<p class="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
			<a href="/contacts/{plan.contactId}" class="hover:underline"
				>{t('home.planWith', { name: plan.contactName })}</a
			>
			{#if plan.bookedAt !== null}
				<span aria-hidden="true">·</span>
				<span
					class="inline-flex items-center gap-1 font-semibold text-primary"
					data-testid="plan-booked"><Icon name="done" size={11} />{t('plans.booked')}</span
				>
			{/if}
			{#if kept}
				<span aria-hidden="true">·</span>
				<span class="inline-flex items-center gap-1"
					><Icon name="offline" size={11} />{t('home.outbox.notSent')}</span
				>
			{/if}
		</p>
		{#if plan.when}
			<WhenChip when={plan.when} state={standing} {today} />
		{/if}
	</div>
	<PlanStep
		plan={{ id: plan.id, title: plan.title }}
		contactId={plan.contactId}
		step="done"
		{kept}
		id={boxId}
	/>
</li>
