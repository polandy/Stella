<script lang="ts">
	import type { StreamTime } from '$lib/stream/days';

	/*
	 * The time beside a stream item (docs/02 §2.22.2): the time of day under *Today* and
	 * *Yesterday*, nothing under an older day, whose heading already says when. `streamTime`
	 * decides; the full date and time are the tooltip.
	 */
	let { time }: { time: StreamTime } = $props();
</script>

{#if time.label}
	<time
		datetime={time.datetime}
		title={time.title}
		class="ml-auto text-xs whitespace-nowrap text-fg-subtle tabular-nums">{time.label}</time
	>
{/if}
