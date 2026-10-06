<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { planLastName } from '$lib/surnames/plan';

	/*
	 * *Set last name* for the people selected (docs/concepts/surnames.md §3.2): one field, with
	 * the household's surnames offered, then a short confirmation. Whoever already has a
	 * different last name is named and left unticked, so a bulk action never overwrites
	 * silently; whoever already carries this one is left alone and not counted.
	 */
	let {
		chosen,
		knownSurnames,
		held,
		disabled,
		oncancel,
		onheld
	}: {
		chosen: readonly { id: string; displayName: string; lastName: string | null }[];
		knownSurnames: readonly string[];
		held: SubmitFunction;
		disabled: boolean;
		oncancel: () => void;
		/** The batch was handed to the undo window. */
		onheld: () => void;
	} = $props();

	const t = useTranslate();
	const uid = $props.id();
	let name = $state('');
	let confirming = $state(false);
	/** Those with a different last name whom the member ticked to replace it. */
	let replace = $state<Record<string, boolean>>({});

	const typed = $derived(name.trim());
	const plan = $derived(planLastName(chosen, typed, replace));
</script>

<div class="flex w-full flex-col gap-2" data-testid="set-last-name">
	{#if !confirming}
		<div class="flex flex-wrap items-center gap-2">
			<label for="{uid}-name" class="text-sm text-fg-muted">{t('surnames.setLastName')}</label>
			<Combobox
				id="{uid}-name"
				name="lastName"
				bind:value={name}
				options={knownSurnames}
				placeholder={t('surnames.lastNamePlaceholder')}
				placement="above"
				class="w-44 rounded-md border border-border-input bg-bg px-3 py-2 text-fg"
			/>
			<Button
				variant="primary"
				size="sm"
				type="button"
				disabled={disabled || !typed || chosen.length === 0}
				onclick={() => (confirming = true)}
			>
				{t('surnames.next')}
			</Button>
			<Button variant="ghost" size="sm" type="button" onclick={oncancel}
				>{t('common.cancel')}</Button
			>
		</div>
	{:else}
		<form
			method="POST"
			action="?/setLastNames"
			use:enhance={(event) => {
				const submit = held(event);
				onheld();
				return submit;
			}}
			class="flex flex-col gap-2"
		>
			<input type="hidden" name="lastName" value={typed} />
			{#each plan.written as p (p.id)}<input type="hidden" name="contactId" value={p.id} />{/each}
			{#each plan.replaceIds as id (id)}<input type="hidden" name="replaceId" value={id} />{/each}
			<p class="text-sm text-fg">
				{t('surnames.confirm', { name: typed, count: plan.written.length })}
			</p>
			{#each plan.different as p (p.id)}
				<label class="flex items-center gap-2 text-sm text-fg-muted">
					<input type="checkbox" class="size-5" bind:checked={replace[p.id]} />
					{t('surnames.replace', { person: p.displayName, name: p.lastName ?? '' })}
				</label>
			{/each}
			<div class="flex gap-2">
				<Button variant="primary" size="sm" disabled={disabled || plan.written.length === 0}
					>{t('surnames.set')}</Button
				>
				<Button variant="ghost" size="sm" type="button" onclick={() => (confirming = false)}
					>{t('surnames.back')}</Button
				>
			</div>
		</form>
	{/if}
</div>
