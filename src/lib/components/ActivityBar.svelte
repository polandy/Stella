<script lang="ts">
	/*
	 * "Still working", said once for the whole app (docs/05 §5.7).
	 *
	 * A change that reloads what is on screen — a relationship and the graph behind it — or a
	 * page that is still loading, shows here. Every shape is fixed to the viewport and so takes
	 * **no space in the layout**: an indicator that pushes the page down as it appears makes the
	 * wait worse than showing nothing, because the line somebody was reading moves out from
	 * under them. Nothing is dimmed, covered or disabled while it runs.
	 *
	 * The live region is always mounted, so a screen reader hears the work start rather than the
	 * region appear; the drawing itself is decorative and `label` is what is announced.
	 */
	import type { ActivityVariant } from '$lib/sync/activity-variant';

	let {
		busy = false,
		label,
		variant = 'bar'
	}: { busy?: boolean; label: string; variant?: ActivityVariant } = $props();
</script>

<div role="status" aria-live="polite" class="pointer-events-none">
	{#if busy}
		{#if variant === 'bar'}
			<!-- A line across the top of the window, on a tinted track so the travel reads. -->
			<div class="fixed inset-x-0 top-0 z-40 h-1 overflow-hidden bg-primary-soft">
				<div class="activity-travel h-full w-2/5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"></div>
			</div>
			<span class="sr-only">{label}</span>
		{:else if variant === 'pill'}
			<!-- A label under the top edge, centred: unmissable, and still out of the layout. -->
			<div class="fixed inset-x-0 top-3 z-40 flex justify-center">
				<div class="activity-enter flex items-center gap-2 rounded-full bg-card px-3.5 py-2 text-sm font-medium text-fg shadow-pop ring-1 ring-border-subtle">
					<span aria-hidden="true" class="size-4 animate-spin rounded-full border-2 border-primary-soft border-t-primary motion-reduce:animate-none"></span>
					{label}
				</div>
			</div>
		{:else}
			<!-- Where the toasts are, so waiting and what came of it speak from one place. -->
			<div class="fixed bottom-20 right-4 z-40 md:bottom-4">
				<div class="activity-enter flex items-center gap-2 rounded-full bg-card px-3.5 py-2 text-sm font-medium text-fg shadow-pop ring-1 ring-border-subtle">
					<span aria-hidden="true" class="size-4 animate-spin rounded-full border-2 border-primary-soft border-t-primary motion-reduce:animate-none"></span>
					{label}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.activity-travel {
		animation: travel 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	@keyframes travel {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(350%);
		}
	}

	.activity-enter {
		animation: enter 0.18s ease-out;
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	/* Still visible, no longer moving. */
	@media (prefers-reduced-motion: reduce) {
		.activity-travel {
			animation: none;
			width: 100%;
		}

		.activity-enter {
			animation: none;
		}
	}
</style>
