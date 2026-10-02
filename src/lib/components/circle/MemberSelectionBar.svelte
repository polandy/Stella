<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The bar that acts on the members selected on a circle's page (docs/02 §2.4.2): one role for
	 * all of them, or removing them. Fixed to the bottom so it stays in reach however long the
	 * circle is; offset above the mobile bottom tab bar (src/routes/(app)/+layout.svelte) so the
	 * two never overlap, and below Toast's z-30 so a save/undo toast is never hidden behind it.
	 */
	let {
		chosenIds,
		everyoneChosen,
		roleSuggestions,
		roleSaved,
		bulkRole = $bindable(),
		ontoggleeveryone,
		onremove
	}: {
		chosenIds: string[];
		everyoneChosen: boolean;
		roleSuggestions: string[];
		roleSaved: SubmitFunction;
		bulkRole: string;
		ontoggleeveryone: () => void;
		onremove: () => void;
	} = $props();

	const t = useTranslate();
	const INPUT = 'rounded-md border border-border-input bg-bg px-3 py-2 text-fg';
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 md:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
	data-testid="selection-bar"
>
	<div class="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-app border border-border bg-card p-2.5 shadow-pop">
		<strong class="px-1 text-sm tabular-nums text-fg" aria-live="polite">
			{chosenIds.length ? t('circles.selectedCount', { count: chosenIds.length }) : t('circles.selectNone')}
		</strong>
		<Button type="button" size="sm" onclick={ontoggleeveryone}>
			{everyoneChosen ? t('circles.selectNoOne') : t('circles.selectEveryone')}
		</Button>
		<form method="POST" action="?/setRole" use:enhance={roleSaved} class="ml-auto flex flex-wrap items-center gap-2">
			{#each chosenIds as contactId (contactId)}
				<input type="hidden" name="contactId" value={contactId} />
			{/each}
			<label for="bulk-role" class="text-sm text-fg-muted">{t('circles.bulkRole')}</label>
			<Combobox
				id="bulk-role"
				name="role"
				bind:value={bulkRole}
				options={roleSuggestions}
				placeholder={t('circles.bulkRoleHint')}
				placement="above"
				class="w-44 {INPUT}"
			/>
			<Button variant="primary" size="sm" disabled={chosenIds.length === 0}>{t('circles.bulkApply')}</Button>
		</form>
		<Button type="button" variant="danger" size="sm" disabled={chosenIds.length === 0} onclick={onremove}>
			{t('circles.bulkRemove')}
		</Button>
	</div>
</div>
