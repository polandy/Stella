<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import SetLastNamePanel from './SetLastNamePanel.svelte';

	/*
	 * The bar that acts on the people selected in a list (docs/concepts/surnames.md §3.2): how
	 * many are chosen, everyone or no one, and *Set last name*. Fixed to the bottom like the
	 * circle members' bar (docs/02 §2.4.2) and offset the same way above the phone's tab bar.
	 */
	let {
		chosen,
		everyoneChosen,
		knownSurnames,
		held,
		disabled,
		offlineLine,
		ontoggleeveryone,
		ondone
	}: {
		chosen: readonly { id: string; displayName: string; lastName: string | null }[];
		everyoneChosen: boolean;
		knownSurnames: readonly string[];
		held: SubmitFunction;
		disabled: boolean;
		/** Why nothing can be set right now, or null. */
		offlineLine: string | null;
		ontoggleeveryone: () => void;
		/** A batch was handed to the undo window: the selection has done its job. */
		ondone: () => void;
	} = $props();

	const t = useTranslate();
	let setting = $state(false);
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 md:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
	data-testid="selection-bar"
>
	<div class="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-app border border-border bg-card p-2.5 shadow-pop">
		{#if setting}
			<SetLastNamePanel
				{chosen}
				{knownSurnames}
				{held}
				{disabled}
				oncancel={() => (setting = false)}
				onheld={() => {
					setting = false;
					ondone();
				}}
			/>
		{:else}
			<strong class="px-1 text-sm tabular-nums text-fg" aria-live="polite">
				{chosen.length ? t('circles.selectedCount', { count: chosen.length }) : t('circles.selectNone')}
			</strong>
			<Button type="button" size="sm" onclick={ontoggleeveryone}>
				{everyoneChosen ? t('circles.selectNoOne') : t('circles.selectEveryone')}
			</Button>
			<Button type="button" variant="primary" size="sm" class="ml-auto" disabled={disabled || chosen.length === 0} onclick={() => (setting = true)}>
				{t('surnames.setLastName')}
			</Button>
		{/if}
		{#if offlineLine}<p class="w-full text-xs text-fg-subtle">{offlineLine}</p>{/if}
	</div>
</div>
