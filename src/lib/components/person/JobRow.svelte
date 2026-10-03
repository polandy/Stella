<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { JOB_FIELD_MAX_LENGTH, jobShortForm } from '$lib/people/job';
	import { focusDestination } from '$lib/ui/focus-destination';
	import { focusLeftForm, owesFocusBack } from '$lib/ui/focus-return';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';

	/*
	 * What a person does and where, set where it is read (docs/02 §2.2). One row shows the short
	 * form; a tap opens both fields together, because they are usually entered together. Enter
	 * saves both, Escape puts the row back, and an emptied field takes that part off the record.
	 * Like `InlineEdit`, the drafts are this row's own state, seeded on each open, so cancelling
	 * needs no undo and a page update cannot overwrite what is being typed.
	 */
	interface Props {
		jobTitle: string | null;
		company: string | null;
		/** An error from the last save; keeps the editor open so the message has a home. */
		error?: string | null;
	}
	let { jobTitle, company, error = null }: Props = $props();

	const t = useTranslate();
	const uid = $props.id();
	const errorId = `${uid}-error`;
	const line = $derived(jobShortForm({ jobTitle, company }, (parts) => t('contact.job.at', parts)));

	let editing = $state(false);
	let draftTitle = $state('');
	let draftCompany = $state('');
	const open = $derived(editing || error !== null);
	const saved = savedEnhance(useRemovals(), t('components.saved'), () => (editing = false));

	function start() {
		draftTitle = jobTitle ?? '';
		draftCompany = company ?? '';
		editing = true;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			editing = false;
		}
	}

	// Focus the job title the moment the editor appears, so the tap lands in the text.
	let firstField = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (open) firstField?.focus();
	});

	// And hand focus back to the row once the editor goes, as `InlineEdit` does (WCAG 2.4.3).
	let trigger = $state<HTMLButtonElement | null>(null);
	let focusInForm = false;
	let wasOpen = false;
	function onFocusOut(event: FocusEvent) {
		const formEl = event.currentTarget as HTMLFormElement;
		if (focusLeftForm(focusDestination(formEl, event.relatedTarget))) focusInForm = false;
	}
	$effect(() => {
		const justClosed = wasOpen && !open;
		wasOpen = open;
		if (!justClosed) return;
		const hadFocusInside = focusInForm;
		focusInForm = false;
		void tick().then(() => {
			const active = document.activeElement;
			const focusNow = active === null || active === document.body ? 'page' : 'elsewhere';
			if (owesFocusBack({ hadFocusInside, focusNow })) trigger?.focus();
		});
	});
</script>

<div class="border-t border-border-subtle first:border-t-0" data-row="job">
	{#if open}
		<form
			method="POST"
			action="?/setJob"
			use:enhance={saved}
			onfocusin={() => (focusInForm = true)}
			onfocusout={onFocusOut}
			class="flex flex-col gap-2 py-2"
		>
			<span class="text-sm font-medium text-fg">{t('contact.job')}</span>
			<label class="flex flex-col gap-1 text-xs font-medium text-fg-muted">
				{t('contact.job.title')}
				<input
					bind:this={firstField}
					bind:value={draftTitle}
					name="jobTitle"
					maxlength={JOB_FIELD_MAX_LENGTH}
					autocomplete="off"
					placeholder={t('contact.job.titlePlaceholder')}
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? errorId : undefined}
					onkeydown={onKeydown}
					class="min-h-11 min-w-0 rounded-control border border-border-input bg-bg px-2 py-1.5 text-base text-fg outline-none focus:border-primary"
				/>
			</label>
			<label class="flex flex-col gap-1 text-xs font-medium text-fg-muted">
				{t('contact.job.company')}
				<input
					bind:value={draftCompany}
					name="company"
					maxlength={JOB_FIELD_MAX_LENGTH}
					autocomplete="off"
					placeholder={t('contact.job.companyPlaceholder')}
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? errorId : undefined}
					onkeydown={onKeydown}
					class="min-h-11 min-w-0 rounded-control border border-border-input bg-bg px-2 py-1.5 text-base text-fg outline-none focus:border-primary"
				/>
			</label>
			<FormError message={error} id={errorId} variant="inline" />
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="primary" size="sm">{t('common.save')}</Button>
				<Button variant="ghost" size="sm" type="button" onclick={() => (editing = false)}>{t('common.cancel')}</Button>
				<span class="text-xs text-fg-subtle">{t('contact.job.keys')}</span>
			</div>
		</form>
	{:else}
		<button
			bind:this={trigger}
			type="button"
			onclick={start}
			title={t('contact.job.edit')}
			class="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-control px-1 py-2 text-left text-sm transition-colors hover:bg-card-hover"
		>
			<span class="shrink-0 font-medium text-fg">{t('contact.job')}</span>
			{#if line}
				<span class="ml-auto min-w-0 text-right text-fg-muted [overflow-wrap:anywhere]" data-testid="job-value">{line}</span>
			{:else}
				<span class="ml-auto truncate text-fg-subtle">{t('contact.job.notRecorded')}</span>
			{/if}
		</button>
	{/if}
</div>
