<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { LastNameAnswers } from '$lib/components/surnames/last-name-answers.svelte';
	import type { SurnamePersonView } from './types';

	/*
	 * A row's ⋯ menu on the *Last names* list (docs/02 §2.2.4.2), the same in every section:
	 * whatever the section puts first (the lower-ranked names), then *Not Brunner* for each name
	 * proposed, then *No last name*, which settles the person. Both answers are saved at once,
	 * with Undo in the toast.
	 */
	let {
		person,
		declinable,
		answers,
		disabled,
		children
	}: {
		person: SurnamePersonView;
		/** The names proposed on this row, each offered as *Not …*. */
		declinable: readonly string[];
		answers: LastNameAnswers;
		/** Out of reach: nothing can be sent, so nothing is offered. */
		disabled: boolean;
		children?: Snippet;
	} = $props();

	const t = useTranslate();
</script>

<details class="relative shrink-0">
	<summary
		class="grid size-8 cursor-pointer list-none place-items-center rounded-control text-fg-subtle hover:bg-card-hover"
		aria-label={t('surnames.rowMenu', { name: person.displayName })}
	>
		<Icon name="more" size={16} />
	</summary>
	<div
		class="absolute right-0 z-10 mt-1 flex w-60 flex-col gap-1 rounded-app border border-border bg-card p-1.5 shadow-pop"
	>
		{@render children?.()}
		{#each declinable as name (name)}
			<form
				method="POST"
				action="?/dismissLastName"
				use:enhance={answers.dismiss(person.displayName, name)}
			>
				<input type="hidden" name="lastName" value={name} />
				<input type="hidden" name="contactId" value={person.id} />
				<Button variant="ghost" size="sm" class="w-full justify-start" {disabled}>
					{t('surnames.notThisName', { name })}
				</Button>
			</form>
		{/each}
		{#if declinable.length > 0 || children}<hr class="mx-1 border-border-subtle" />{/if}
		<form
			method="POST"
			action="?/settleWithoutLastName"
			use:enhance={answers.settle(person.displayName)}
		>
			<input type="hidden" name="contactId" value={person.id} />
			<Button variant="ghost" size="sm" class="w-full justify-start" {disabled}>
				{t('surnames.noLastName')}
			</Button>
			<p class="px-3 pb-1 text-xs text-fg-subtle">{t('surnames.noLastNameHint')}</p>
		</form>
	</div>
</details>
