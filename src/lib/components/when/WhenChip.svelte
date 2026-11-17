<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { whenChip } from '$lib/when/labels';
	import type { When } from '$lib/when/when';

	/* What a record waits for, on its row: *From age 8*, *Christmas 2027* (docs/dev/02 §2.25.8). */
	let { when }: { when: When } = $props();

	const i18n = useI18n();
</script>

<p
	class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary"
	data-testid="when-chip"
>
	<Icon name="calendar" size={11} />{whenChip(i18n, when)}
</p>
