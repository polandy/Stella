<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { submitAction } from '$lib/undo/submit-action';
	import type { SubmitFunction } from '@sveltejs/kit';

	/*
	 * Booking an outing idea, or ticking it done (docs/dev/02 §2.27): saved at once through the
	 * outbox, so it works on a phone out of reach too. The toast offers *Undo*, which posts the
	 * opposite step; one still on the device is dropped there instead.
	 */
	interface Props {
		plan: { id: string; title: string };
		contactId: string;
		step: 'book' | 'done';
		/** Already taken on this device and not sent yet. */
		kept: boolean;
		/** The box's id, which the row's line names, so the whole line ticks. */
		id?: string;
	}
	let { plan, contactId, step, kept, id }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();
	let saving = $state(false);
	const UNDO = { book: 'unbookPlan', done: 'reopenPlan' } as const;
	const toast = $derived(
		step === 'book'
			? t('plans.bookedToast', { title: plan.title })
			: t('plans.doneToast', { title: plan.title })
	);

	async function undo() {
		const body = new FormData();
		body.set('planId', plan.id);
		body.set('contactId', contactId);
		try {
			await submitAction(fetch, `${page.url.pathname}?/${UNDO[step]}`, body);
		} catch {
			removals.notify(t('errors.plan.couldNotSave'));
		}
		await invalidateAll();
	}

	const keep = $derived(
		keepable(
			{
				toCommand: (_data, commandId) => ({
					id: commandId,
					type: step === 'book' ? 'plan.book' : 'plan.done',
					payload: { contactId, planId: plan.id },
					issuedAt: Date.now()
				}),
				// Shown on Home while it waits: the step names nothing but its idea.
				about: plan.title,
				errorKey: 'planTickError',
				onApplied: () => {
					removals.notify(toast, undo);
				},
				onKept: (command) => {
					removals.notify(toast, () => void outbox.discard(command.id));
				}
			},
			() => {}
		)
	);
	const submit: SubmitFunction = async (input) => {
		saving = true;
		await keep(input);
		saving = false;
	};
</script>

<form
	method="POST"
	action={step === 'book' ? '?/bookPlan' : '?/donePlan'}
	use:enhance={submit}
	class="flex shrink-0 {step === 'done' ? 'pt-0.5' : ''}"
>
	<input type="hidden" name="planId" value={plan.id} />
	<input type="hidden" name="contactId" value={contactId} />
	{#if step === 'done'}
		<!-- On the row's right end, where a right thumb finds it (docs/dev/05 §5.1). -->
		<label class="tap-target flex cursor-pointer">
			<input
				{id}
				type="checkbox"
				checked={saving || kept}
				disabled={saving || kept}
				aria-label={t('plans.tick', { title: plan.title })}
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
				class="size-5 shrink-0"
				data-testid="plan-done"
			/>
		</label>
	{:else}
		<Button
			variant="secondary"
			size="sm"
			disabled={saving || kept}
			label={t('plans.bookLabel', { title: plan.title })}
			data-testid="plan-book">{t('plans.book')}</Button
		>
	{/if}
</form>
