<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { whenStateChip } from '#lib/when/labels.js';
	import { asks, type WhenState } from '#lib/when/state.js';
	import type { When } from '#lib/when/when.js';

	/* What a record waits for, on its row: *From age 8*, *For the 6th birthday · in 34 days* (docs/dev/02 §2.25.8). */
	let {
		when,
		state = null,
		today = ''
	}: { when: When; state?: WhenState | null; today?: string } = $props();

	const i18n = useI18n();
	const asking = $derived(state !== null && asks(state));
</script>

<p
	class={[
		'mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
		asking ? 'bg-warning-soft text-fg' : 'bg-primary-soft text-primary'
	]}
	data-testid="when-chip"
	data-state={state?.kind ?? 'waiting'}
>
	<Icon name="calendar" size={11} />{whenStateChip(i18n, when, state, today)}
</p>
