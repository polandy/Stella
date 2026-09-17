<script lang="ts">
	/*
	 * "Still working", said once for the whole app (docs/05 §5.7).
	 *
	 * A change that reloads what is on screen — a relationship and the graph behind it — or a
	 * page that is still loading, shows as a thin bar along the very top of the window. It is
	 * fixed to the viewport and so takes **no space in the layout**: an indicator that pushes
	 * the page down as it appears makes the wait worse than showing nothing, because the line
	 * somebody was reading moves out from under them.
	 *
	 * Nothing is dimmed, covered or disabled while it runs: what is on screen is still true
	 * until the answer arrives, and still worth reading.
	 */
	let { busy = false, label }: { busy?: boolean; label: string } = $props();
</script>

<!--
	The live region is always mounted, so a screen reader hears the work start rather than the
	region appear; the bar itself is decorative, and `label` is what is announced.
-->
<div role="status" aria-live="polite" class="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5">
	{#if busy}
		<div class="h-full w-full overflow-hidden bg-primary-soft">
			<div class="activity-bar h-full w-2/5 rounded-full bg-primary"></div>
		</div>
		<span class="sr-only">{label}</span>
	{/if}
</div>

<style>
	.activity-bar {
		animation: activity 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	@keyframes activity {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(350%);
		}
	}

	/* Still visible, no longer moving: the bar sits filled while the work runs. */
	@media (prefers-reduced-motion: reduce) {
		.activity-bar {
			animation: none;
			width: 100%;
		}
	}
</style>
