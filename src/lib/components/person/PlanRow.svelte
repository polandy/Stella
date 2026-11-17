<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import WhenChip from '$lib/components/when/WhenChip.svelte';
	import { enhance } from '$app/forms';
	import type { PartialDate } from '$lib/dates/partial-date';
	import { dayLabel } from '$lib/dates/labels';
	import { journalEntryPath } from '$lib/people/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { planState } from '$lib/plans/card';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import PlanForm from './PlanForm.svelte';
	import PlanStep from './PlanStep.svelte';
	import type { PersonPageData } from './types';

	/*
	 * One outing idea on the Outings card (docs/dev/02 §2.27): what it is, when, who noted it, and
	 * the done box on the right. *Booked* fixes it; a booked one says so and may be loosened
	 * again. A done one shows its day and may be opened again, told of in a moment or noted anew.
	 * The pencil rewrites it in place; removing it has the undo every removal has (docs/dev/02 §2.23).
	 */
	interface Props {
		plan: PersonPageData['plans'][number];
		contactId: string;
		today: string;
		birth: PartialDate | null;
		estimateHref: string;
		/** The person's name, said when an idea is kept from them. */
		name: string;
		/** Whether the person is a member, who may then be kept from an idea. */
		personIsMember: boolean;
		/** A booking or a tick taken on this device and not sent yet. */
		kept: 'book' | 'done' | null;
		/** The refusal of this row's last save, if any. */
		error: string | null;
		/** Opens the story's composer on a moment about this idea, once done (§2.27.8). */
		writeMoment: (planId: string) => void;
	}
	let {
		plan,
		contactId,
		today,
		birth,
		estimateHref,
		name,
		personIsMember,
		kept,
		error,
		writeMoment
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	let mode = $state<'view' | 'edit'>('view');
	let row = $state<HTMLElement>();
	const done = $derived(plan.doneOn !== null || kept === 'done');
	const booked = $derived(plan.bookedAt !== null || kept === 'book');
	const standing = $derived(plan.doneOn === null ? planState(plan, birth, today) : null);
	const boxId = $derived(`plan-done-${plan.id}`);

	async function startEditing() {
		mode = 'edit';
		await tick();
		row?.querySelector<HTMLElement>('input:not([type="hidden"])')?.focus();
	}
	function close() {
		mode = 'view';
		void tick().then(() => row?.querySelector<HTMLElement>('[data-plan-actions] button')?.focus());
	}
	const savedEdit = savedEnhance(removals, t('components.saved'), close);
	const saved = savedEnhance(removals, t('components.saved'), () => {});
	const noted = $derived(
		savedEnhance(removals, t('plans.againToast', { title: plan.title }), () => {})
	);
</script>

<li bind:this={row} class="flex gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
	{#if mode === 'edit'}
		<div class="min-w-0 flex-1" transition:reveal>
			<PlanForm
				{plan}
				heading={t('plans.edit', { title: plan.title })}
				action="?/editPlan"
				submit={savedEdit}
				{today}
				canChooseVisibility={plan.mine}
				person={personIsMember ? name : null}
				{birth}
				{estimateHref}
				{error}
				onCancel={close}
			/>
		</div>
	{:else}
		<div class="flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1">
			<div class="min-w-0 flex-1">
				<!-- The whole line ticks: a 20 px box alone is too small a target on a phone. -->
				<label
					for={done ? undefined : boxId}
					class="block font-medium break-words {done ? 'text-fg-muted' : 'cursor-pointer text-fg'}"
				>
					{plan.title}
				</label>
				{#if plan.doneOn}
					<p class="text-sm text-fg-muted" data-testid="plan-done-on">
						{t('plans.doneOn', { day: dayLabel(i18n, plan.doneOn) })}
					</p>
				{:else if plan.when}
					<WhenChip when={plan.when} state={standing} {today} />
				{/if}
				{#if plan.note}
					<p class="text-sm whitespace-pre-line text-fg-muted">{plan.note}</p>
				{/if}
				<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
					{#if booked && !done}
						<span
							class="inline-flex items-center gap-1 font-semibold text-primary"
							data-testid="plan-booked"
						>
							<Icon name="done" size={11} />{plan.bookedBy
								? t('plans.bookedBy', { name: plan.bookedBy })
								: t('plans.booked')}
						</span>
						<span aria-hidden="true">·</span>
					{/if}
					{#if kept}
						<span class="inline-flex items-center gap-1">
							<Icon name="offline" size={11} />{t('home.outbox.notSent')}
						</span>
						<span aria-hidden="true">·</span>
					{/if}
					<span
						>{plan.mine
							? t('plans.notedByYou')
							: t('plans.notedBy', { name: plan.notedBy ?? '…' })}</span
					>
					{#if plan.url}
						<span aria-hidden="true">·</span>
						<a
							href={plan.url}
							target="_blank"
							rel="noreferrer noopener"
							class="inline-flex items-center gap-1 text-link hover:underline"
							aria-label={t('plans.openLink', { title: plan.title })}
						>
							<Icon name="link" size={11} />{t('plans.link')}
						</a>
					{/if}
					{#if plan.hiddenFromPerson}
						<span aria-hidden="true">·</span>
						<span class="inline-flex items-center gap-1" data-testid="plan-surprise">
							<Icon name="surprise" size={11} />{t('plans.hiddenFrom', { name })}
						</span>
					{/if}
					{#if plan.visibility === 'private'}
						<span aria-hidden="true">·</span>
						<span class="inline-flex items-center gap-1" title={t('common.onlyYouSee')}>
							<Icon name="private" size={11} />{t('common.privateInline')}
						</span>
					{/if}
				</p>
				<FormError message={error} variant="inline" />
				{#if plan.doneOn}
					<!-- Afterwards: the moment told of it, and the idea noted once more (§2.27.8). -->
					<div class="mt-2 flex flex-wrap gap-2">
						{#if plan.momentId}
							<Button
								variant="ghost"
								size="sm"
								icon="journal"
								href={journalEntryPath(contactId, plan.momentId)}
								label={t('plans.momentLabel', { title: plan.title })}
								data-testid="plan-moment">{t('plans.moment')}</Button
							>
						{:else}
							<Button
								variant="secondary"
								size="sm"
								icon="journal"
								type="button"
								label={t('plans.writeMomentLabel', { title: plan.title })}
								onclick={() => writeMoment(plan.id)}
								data-testid="plan-write-moment">{t('plans.writeMoment')}</Button
							>
						{/if}
						<form method="POST" action="?/againPlan" use:enhance={noted}>
							<input type="hidden" name="planId" value={plan.id} />
							<Button
								variant="ghost"
								size="sm"
								label={t('plans.againLabel', { title: plan.title })}
								data-testid="plan-again">{t('plans.again')}</Button
							>
						</form>
					</div>
				{/if}
				{#if !done && !kept}
					<!-- Under the idea rather than beside it, so a phone keeps the title on one line. -->
					<div class="mt-2 flex flex-wrap gap-2">
						{#if plan.bookedAt === null}
							<PlanStep {plan} {contactId} step="book" kept={false} />
						{:else}
							<form method="POST" action="?/unbookPlan" use:enhance={saved}>
								<input type="hidden" name="planId" value={plan.id} />
								<Button
									variant="ghost"
									size="sm"
									label={t('plans.unbookLabel', { title: plan.title })}
									data-testid="plan-unbook">{t('plans.unbook')}</Button
								>
							</form>
						{/if}
					</div>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1" data-plan-actions>
				{#if plan.doneOn}
					<form method="POST" action="?/reopenPlan" use:enhance={saved}>
						<input type="hidden" name="planId" value={plan.id} />
						<Button
							variant="ghost"
							size="sm"
							label={t('plans.reopen', { title: plan.title })}
							data-testid="plan-reopen">{t('plans.notDone')}</Button
						>
					</form>
				{:else if !kept}
					<Button
						variant="ghost"
						size="sm"
						type="button"
						icon="rename"
						label={t('plans.edit', { title: plan.title })}
						title={t('plans.edit', { title: plan.title })}
						onclick={startEditing}
					/>
				{/if}
				{#if !kept}
					<RemoveButton
						kind="plan"
						id={plan.id}
						action="?/removePlan"
						fields={{ planId: plan.id }}
						label={t('plans.remove', { title: plan.title })}
						removed={t('plans.removed')}
					/>
				{/if}
			</div>
		</div>
		{#if !plan.doneOn}
			<PlanStep
				{plan}
				{contactId}
				step="done"
				kept={kept === 'done'}
				id={boxId}
				writeMoment={() => writeMoment(plan.id)}
			/>
		{/if}
	{/if}
</li>
