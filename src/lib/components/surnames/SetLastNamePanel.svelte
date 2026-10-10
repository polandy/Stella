<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/ui/Button.svelte';
	import Combobox from '$lib/components/ui/Combobox.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { planLastName, replaceAll } from '$lib/surnames/plan';

	/*
	 * *Set last name* for the people selected (docs/02 §2.2.4.3): one field, with
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

<!--
	One form for both steps, so *Set* can send from the first when nobody has a different last
	name — there is nothing to confirm then, and the undo window still covers the batch.
-->
<form
	method="POST"
	action="?/setLastNames"
	use:enhance={(event) => {
		// Enter in the name field submits from the first step too: it must not skip the question.
		if (!confirming && (!typed || plan.asks || plan.written.length === 0)) {
			event.cancel();
			if (plan.asks && typed) confirming = true;
			return;
		}
		const submit = held(event);
		onheld();
		return submit;
	}}
	class="flex w-full flex-col gap-2"
	data-testid="set-last-name"
>
	{#each plan.written as p (p.id)}<input type="hidden" name="contactId" value={p.id} />{/each}
	{#each plan.replaceIds as id (id)}<input type="hidden" name="replaceId" value={id} />{/each}
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
			{#if plan.asks && typed}
				<Button
					variant="primary"
					size="sm"
					type="button"
					{disabled}
					onclick={() => (confirming = true)}
				>
					{t('surnames.next')}
				</Button>
			{:else}
				<Button
					variant="primary"
					size="sm"
					disabled={disabled || !typed || plan.written.length === 0}>{t('surnames.set')}</Button
				>
			{/if}
			<Button variant="ghost" size="sm" type="button" onclick={oncancel}
				>{t('common.cancel')}</Button
			>
		</div>
	{:else}
		<input type="hidden" name="lastName" value={typed} />
		<p class="text-sm text-fg">
			{t('surnames.confirm', { name: typed, count: plan.written.length })}
		</p>
		{#if plan.different.length > 1}
			<label class="flex items-center gap-2 text-sm text-fg">
				<input
					type="checkbox"
					class="size-5"
					checked={plan.replacesAll}
					onchange={(e) => (replace = replaceAll(plan, e.currentTarget.checked))}
				/>
				{t('surnames.replaceAll', { count: plan.different.length })}
			</label>
		{/if}
		<!-- Indented under *Replace all* when it is there, so the rows read as what it ticks. -->
		<div class={['flex flex-col gap-2', plan.different.length > 1 && 'pl-7']}>
			{#each plan.different as p (p.id)}
				<label class="flex items-center gap-2 text-sm text-fg-muted">
					<input type="checkbox" class="size-5" bind:checked={replace[p.id]} />
					{t('surnames.replace', { person: p.displayName, name: p.lastName ?? '' })}
				</label>
			{/each}
		</div>
		<div class="flex gap-2">
			<Button variant="primary" size="sm" disabled={disabled || plan.written.length === 0}
				>{t('surnames.set')}</Button
			>
			<Button variant="ghost" size="sm" type="button" onclick={() => (confirming = false)}
				>{t('surnames.back')}</Button
			>
		</div>
	{/if}
</form>
