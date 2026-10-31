<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { INPUT } from './inputs';

	/*
	 * Noting a to-do, or rewriting one (docs/02 §2.26): one line, and a day only when asked for —
	 * most things owed someone have none. Enter saves.
	 */
	interface Props {
		/** The to-do being rewritten; absent while noting a new one. */
		todo?: {
			id: string;
			title: string;
			dueOn: string | null;
			visibility: 'shared' | 'private';
		};
		/** Names the form: *To-do for Hilde*, *Change: …*. */
		heading: string;
		action: string;
		submit: SubmitFunction;
		/** The day a newly asked-for day starts on. */
		today: string;
		/** Only the to-do's author may make it private, or shared again. */
		canChooseVisibility: boolean;
		/** Where the form shows its own refusal, when the card does not. */
		error?: string | null;
		/** Closes the form; the card's own add form is closed by the card's *Cancel*. */
		onCancel?: () => void;
	}
	let {
		todo,
		heading,
		action,
		submit,
		today,
		canChooseVisibility,
		error = null,
		onCancel
	}: Props = $props();

	const t = useI18n().t;
	// svelte-ignore state_referenced_locally
	let hasDay = $state(todo?.dueOn != null);
	// svelte-ignore state_referenced_locally
	let visibility = $state<'shared' | 'private'>(todo?.visibility ?? 'shared');
</script>

<form
	method="POST"
	{action}
	use:enhance={submit}
	class="flex flex-col gap-3"
	data-testid="todo-form"
>
	<h3 class="text-sm font-semibold text-fg">{heading}</h3>
	{#if todo}<input type="hidden" name="todoId" value={todo.id} />{/if}

	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('todos.form.what')}</span>
		<input
			name="title"
			required
			value={todo?.title ?? ''}
			placeholder={t('todos.form.whatPlaceholder')}
			class="{INPUT} w-full"
		/>
	</label>

	{#if hasDay}
		<div class="flex flex-col gap-1">
			<span class="text-xs font-medium text-fg-muted">{t('todos.form.by')}</span>
			<div class="flex flex-wrap items-center gap-3">
				<DateField name="dueOn" value={todo?.dueOn ?? today} label={t('todos.form.by')} />
				<button
					type="button"
					onclick={() => (hasDay = false)}
					class="text-sm text-link hover:underline"
				>
					{t('todos.form.noDay')}
				</button>
			</div>
		</div>
	{:else}
		<!-- No day posts an empty one, which clears a day the to-do had. -->
		<input type="hidden" name="dueOn" value="" />
		<button
			type="button"
			onclick={() => (hasDay = true)}
			class="inline-flex w-fit items-center gap-1 text-sm text-link hover:underline"
		>
			<Icon name="calendar" size={13} />{t('todos.form.addDay')}
		</button>
	{/if}

	<FormError message={error} variant="inline" />

	<div class="flex flex-wrap items-center gap-4 text-sm">
		{#if canChooseVisibility}
			<fieldset class="flex flex-wrap items-center gap-4">
				<legend class="sr-only">{t('common.visibility')}</legend>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" bind:group={visibility} />
					{t('common.shared')}
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" bind:group={visibility} />
					{t('common.private')}
				</label>
			</fieldset>
		{:else}
			<!-- Someone else's to-do keeps who may see it: only its author decides that. -->
			<input type="hidden" name="visibility" value={visibility} />
		{/if}
		<span class="ml-auto flex gap-2">
			{#if onCancel}
				<Button variant="ghost" size="sm" type="button" onclick={onCancel}
					>{t('common.cancel')}</Button
				>
			{/if}
			<Button variant="primary" size="sm">{t('common.save')}</Button>
		</span>
	</div>
</form>
