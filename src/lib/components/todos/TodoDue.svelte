<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import { dueLabel, dueStanding } from '$lib/todos/todos';

	/*
	 * The day a to-do is due by, as every list of to-dos says it (docs/02 §2.26): weighted while
	 * it is overdue or within the week, quiet when later. Nothing for a to-do with no day.
	 */
	let { dueOn, today }: { dueOn: string | null; today: string } = $props();

	const i18n = useI18n();
	const standing = $derived(dueStanding(dueOn, today));
	const due = $derived(dueLabel(i18n, dueOn, today));
	const DUE_TONE = {
		overdue: 'font-medium text-fg',
		today: 'font-medium text-fg',
		soon: 'font-medium text-fg',
		later: 'text-fg-muted'
	} as const;
</script>

{#if due && standing}
	<span class={DUE_TONE[standing]} data-testid="todo-due">{due}</span>
{/if}
