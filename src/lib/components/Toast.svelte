<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';

	/*
	 * The toast region (docs/05 §5.7): bottom-left, one card per message. A removal's card
	 * carries Undo for as long as the removal is held back; a notice is read-only and goes on
	 * its own. A polite live region (no `status` role, which would make it the page's second
	 * status and steal `getByRole('status')` from inline hints) so a screen reader hears
	 * "Entry removed" without losing focus.
	 *
	 * The window stands still while the pointer is over a toast or focus is inside the region,
	 * and starts over in full once both have left (WCAG 2.2.1; `hold`/`release` in
	 * pending-removals.ts) — reaching for Undo never races the clock.
	 */
	const removals = useRemovals();
	const t = useTranslate();

	let hovered = false;
	let focused = false;
	function follow(next: { hovered?: boolean; focused?: boolean }) {
		hovered = next.hovered ?? hovered;
		focused = next.focused ?? focused;
		if (hovered || focused) removals.hold();
		else removals.release();
	}
	function onFocusOut(event: FocusEvent) {
		if (region?.contains(event.relatedTarget as Node | null)) return;
		follow({ focused: false });
	}

	/*
	 * A toast that goes — Undo pressed, its window over — takes the pointer or the focus with it
	 * without a `pointerleave` or `focusout` a browser can be relied on to send. So whenever the
	 * toasts change, ask the page where the reader actually is, or the hold would never let go.
	 */
	let region: HTMLDivElement | undefined = $state();
	$effect(() => {
		void removals.snapshot;
		if (!region) return;
		follow({ hovered: region.matches(':hover'), focused: region.contains(document.activeElement) });
	});
</script>

<div
	class="pointer-events-none fixed bottom-20 left-4 z-30 flex max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4 md:left-[17rem]"
	role="region"
	aria-label={t('components.toasts')}
	aria-live="polite"
	data-testid="toasts"
	bind:this={region}
	onpointerenter={() => follow({ hovered: true })}
	onpointerleave={() => follow({ hovered: false })}
	onfocusin={() => follow({ focused: true })}
	onfocusout={onFocusOut}
>
	{#each removals.snapshot.removals as removal (removal.key)}
		<div class="toast" data-testid="toast-undo">
			<span class="pl-2">{removal.label}</span>
			<Button variant="secondary" size="sm" onclick={() => removals.undo(removal.key)}>{t('common.undo')}</Button>
		</div>
	{/each}
	{#each removals.snapshot.notices as notice (notice.id)}
		<div class="toast" data-testid="toast-notice">
			<span class="px-2">{notice.text}</span>
		</div>
	{/each}
</div>

<style>
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border-radius: var(--radius-app);
		border: 1px solid var(--border);
		background: var(--card);
		padding: 0.375rem 0.375rem 0.375rem 0.5rem;
		font-size: 0.875rem;
		color: var(--fg);
		box-shadow: var(--shadow-pop);
		animation: toast-in 160ms ease-out;
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
