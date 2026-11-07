<script lang="ts">
	import { FIELD, FIELD_ON_BG } from '$lib/components/ui/field';
	import KnowThemBy from '$lib/components/people/KnowThemBy.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { wantsSomethingToKnowThemBy } from '$lib/people/new-person';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/*
	 * Naming somebody new without leaving the field that found no one (docs/02 §2.2.2): the
	 * moment composer and the person picker both open it. Plain inputs, never a nested `<form>` —
	 * both callers sit inside one. What each adds below the names (more fields, its buttons) is
	 * `children`; Enter and Escape are the caller's, through `onkeydown`.
	 */

	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
		firstName: string;
		lastName: string;
		description: string;
		/** The first-name field, for the caller to put the caret in when the panel opens. */
		firstNameInput?: HTMLInputElement;
		children: Snippet;
	}
	let {
		firstName = $bindable(),
		lastName = $bindable(),
		description = $bindable(),
		firstNameInput = $bindable(),
		children,
		class: className = '',
		...rest
	}: Props = $props();

	const t = useTranslate();
	const askForSomethingToKnowThemBy = $derived(wantsSomethingToKnowThemBy({ firstName, lastName }));
</script>

<div {...rest} class="flex flex-col gap-2.5 {className}" role="none">
	<p class="text-sm font-semibold text-fg">{t('components.personSearch.createTitle')}</p>

	<div class="grid grid-cols-2 gap-2">
		<label class="flex flex-col gap-1 text-xs text-fg-muted">
			{t('components.personSearch.firstName')}
			<input
				bind:this={firstNameInput}
				bind:value={firstName}
				type="text"
				autocomplete="off"
				class="{FIELD} px-2 py-1.5 text-sm"
			/>
		</label>
		<label class="flex flex-col gap-1 text-xs text-fg-muted">
			{t('components.personSearch.lastName')}
			<input
				bind:value={lastName}
				type="text"
				autocomplete="off"
				class="{FIELD} px-2 py-1.5 text-sm"
			/>
		</label>
	</div>

	{#if askForSomethingToKnowThemBy}
		<KnowThemBy
			{firstName}
			compact
			label={t('components.personSearch.description')}
			bind:value={description}
			inputClass="{FIELD_ON_BG} px-2 py-1.5 text-sm"
		/>
	{:else}
		<!-- Worth asking for anyone new, not only a first name alone: it is what they are found by. -->
		<label class="flex flex-col gap-1 text-xs text-fg-muted">
			{t('components.personSearch.description')}
			<input
				bind:value={description}
				type="text"
				autocomplete="off"
				placeholder={t('components.namesake.placeholder')}
				class="{FIELD} px-2 py-1.5 text-sm"
			/>
		</label>
	{/if}

	{@render children()}
</div>
