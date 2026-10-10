<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import type { PendingSink } from '$lib/sync/pending-work';
	import { neighbourAfterLeaving } from '$lib/ui/focus-return';
	import { tick } from 'svelte';

	/*
	 * The one way to remove something with undo (docs/02 §2.23). It is a real form with the
	 * action's own fields, so it still works without JavaScript; with JavaScript the submit is
	 * held back and the toast offers Undo. The list around it hides the row whose key is
	 * pending — `removalKey(kind, id)` builds the same key on both sides.
	 */
	interface Props {
		/** What is being removed; with `id` it makes the key the surrounding list checks. */
		kind: RemovalKind;
		id: string;
		/** The form action, e.g. `?/removeField`. */
		action: string;
		/** The action's own form fields, e.g. `{ fieldId: f.id }`. */
		fields: Record<string, string>;
		/** The button's accessible name, e.g. "Remove birthday". */
		label: string;
		/** What the toast says, e.g. "Date removed". */
		removed: string;
		/** A bare icon for a chip, where a bordered button would be too much. */
		bare?: boolean;
		/**
		 * Counts the commit — the real request plus the reload behind it — for a section that
		 * shows how long it is taking. The undo window itself is not counted: nothing is on its
		 * way to the server yet (docs/05 §5.7).
		 */
		pending?: PendingSink;
		/** Runs as the removal is held, e.g. to close a lightbox the removed thing was open in. */
		onremove?: () => void;
		class?: string;
	}
	let {
		kind,
		id,
		action,
		fields,
		label,
		removed,
		bare = false,
		pending,
		onremove,
		class: className = ''
	}: Props = $props();

	const removals = useRemovals();
	const key = $derived(removalKey(kind, id));

	/** Every remove control of a list carries this, so a neighbour can be found by its key. */
	const KEY_ATTRIBUTE = 'data-removal-key';

	function defer(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		const body = new FormData(formEl);
		// Read before the row goes: afterwards there is no list left to read it from.
		const handOff = focusHandOff(formEl);
		removals.remove(
			deferredRemoval(
				{ kind, id, label: removed, action, body },
				{ fetch, reload: invalidateAll, pending }
			)
		);
		onremove?.();
		if (handOff) void tick().then(handOff);
	}

	/*
	 * The row this button sits in disappears the moment it is pressed, and the focused button
	 * with it — so the browser drops focus on the page and the next Tab starts at the top
	 * (WCAG 2.4.3). From a keyboard, focus moves to the same control of the row that takes its
	 * place, or the row above, or the list's heading once it is empty. A pointer press owes
	 * nothing: moving focus there could scroll the page out from under the hand.
	 */
	function focusHandOff(formEl: HTMLFormElement): (() => void) | null {
		const pressed = document.activeElement;
		if (!(pressed instanceof HTMLElement) || !formEl.contains(pressed)) return null;
		if (!pressed.matches(':focus-visible')) return null;
		const scope = formEl.closest<HTMLElement>('section') ?? formEl.closest<HTMLElement>('main');
		if (!scope) return null;
		const rows = [...scope.querySelectorAll<HTMLElement>(`[${KEY_ATTRIBUTE}]`)].map((row) => ({
			key: row.getAttribute(KEY_ATTRIBUTE) ?? '',
			leaving: false
		}));
		const next = neighbourAfterLeaving(rows, key);
		return () => {
			const target = next
				? scope.querySelector<HTMLElement>(`[${KEY_ATTRIBUTE}="${CSS.escape(next)}"] button`)
				: null;
			if (target) return target.focus();
			const heading = scope.querySelector<HTMLElement>('h1, h2, h3');
			if (heading) {
				heading.tabIndex = -1;
				return heading.focus();
			}
			// A folded profile row has no heading of its own, only the button that unfolds it.
			scope.querySelector<HTMLElement>('[data-section-toggle], button[aria-expanded]')?.focus();
		};
	}
</script>

<form method="POST" {action} class={className} onsubmit={defer} data-removal-key={key}>
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	{#if bare}
		<!-- 24px square at least (WCAG 2.5.8), however small the chip it sits on. -->
		<button
			class="-my-1 grid size-6 place-items-center rounded-full text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg"
			aria-label={label}
		>
			<Icon name="remove" size={13} />
		</button>
	{:else}
		<Button variant="danger" size="sm" icon="remove" {label} title={label} />
	{/if}
</form>
