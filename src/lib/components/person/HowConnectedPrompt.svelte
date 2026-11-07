<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import type { ComponentProps } from 'svelte';

	/*
	 * "How are we connected?" is a question the relationships card cannot answer: it holds two
	 * hops of the household and the chain usually runs further. So it asks who, and hands both
	 * ends to the explorer, which holds the whole graph (docs/05 §5.5). The picker is on the page
	 * rather than in the canvas, since the app's own person picker is what every other "which
	 * person?" question on this page uses.
	 */
	let {
		open = $bindable(),
		contact,
		people
	}: {
		/** Asking who; the picker's field is `#path-target`, for the cursor to be handed to. */
		open: boolean;
		contact: { id: string; displayName: string };
		/** Whom it may be asked about: everyone visible but this person. */
		people: ComponentProps<typeof PersonSearchSelect>['people'];
	} = $props();

	const t = useI18n().t;

	let pathTargetId = $state<string[]>([]);
	const pathTarget = $derived(pathTargetId[0] ?? null);
</script>

{#if open}
	<div
		transition:reveal
		class="mb-3 flex flex-wrap items-end gap-3 rounded-control bg-bg-sunken p-3"
	>
		<label for="path-target" class="flex min-w-48 flex-1 flex-col gap-1 text-sm">
			<span class="text-fg-muted">
				{t('contact.relationships.howConnectedTo', { name: contact.displayName })}
			</span>
			<PersonSearchSelect
				id="path-target"
				{people}
				name="pathTarget"
				bind:selectedIds={pathTargetId}
			/>
		</label>
		<Button
			variant="primary"
			size="sm"
			icon="connectionPath"
			href={pathTarget ? `/graph?center=${contact.id}&path=${pathTarget}` : undefined}
			disabled={!pathTarget}
		>
			{t('contact.relationships.tracePath')}
		</Button>
		<Button type="button" variant="ghost" size="sm" onclick={() => (open = false)}>
			{t('common.cancel')}
		</Button>
	</div>
{/if}
