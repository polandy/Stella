<script lang="ts">
	import { nextMenuIndex } from '$lib/menu/menu';
	import { filterSuggestions } from '$lib/combobox/suggestions';

	/*
	 * A plain text field that suggests values already in use — a circle's roles, a household's
	 * circle names — without ever requiring a pick (docs/05 §5.7, alongside the person search
	 * select and mention field's listbox pattern). It posts one named field, exactly like a bare
	 * `<input>` would: replaces `<input list=… >` + `<datalist>`, which Mobile Safari never shows
	 * a dropdown for.
	 */

	/** Long enough for a click on a suggestion to land before the blur closes the list under it. */
	const BLUR_CLOSE_MS = 120;

	interface Props {
		/** The form field this posts, exactly as a bare `<input name>` would. */
		name: string;
		/** The typed text. Bind this; picking a suggestion just replaces it. */
		value?: string;
		/** What this field already holds, most useful first — offered as-is on an empty query. */
		options: readonly string[];
		id?: string;
		placeholder?: string;
		required?: boolean;
		class?: string;
		/**
		 * Which side the list opens on. `below` (default) suits a field with room under it;
		 * `above` is for one that sits low in the viewport — the circle selection bar's role
		 * field, fixed near the bottom of the screen, would otherwise open a list the bottom tab
		 * bar covers the lower half of.
		 */
		placement?: 'below' | 'above';
	}
	let {
		name,
		value = $bindable(''),
		options,
		id,
		placeholder,
		required = false,
		class: className = '',
		placement = 'below'
	}: Props = $props();

	let open = $state(false);
	let highlighted = $state(-1);
	let input: HTMLInputElement | undefined = $state();
	let root: HTMLDivElement | undefined = $state();

	const matches = $derived(open ? filterSuggestions(value, options) : []);

	function pick(option: string) {
		value = option;
		open = false;
		highlighted = -1;
		input?.focus();
	}

	function closeIfFocusLeft() {
		if (root?.contains(document.activeElement)) return;
		open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open || matches.length === 0) return;
		const next = nextMenuIndex(highlighted, matches.length, event.key);
		if (next !== null) {
			event.preventDefault();
			highlighted = next;
			return;
		}
		if (event.key === 'Enter' && highlighted >= 0) {
			// A suggestion is highlighted: take it instead of submitting the form around us.
			event.preventDefault();
			pick(matches[highlighted]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
			highlighted = -1;
		}
	}
</script>

<div class="relative" bind:this={root}>
	<input
		bind:this={input}
		{id}
		{name}
		type="text"
		role="combobox"
		aria-expanded={open}
		aria-controls={id ? `${id}-listbox` : undefined}
		aria-autocomplete="list"
		autocomplete="off"
		{required}
		{placeholder}
		bind:value
		oninput={() => {
			open = true;
			highlighted = -1;
		}}
		onfocus={() => (open = true)}
		onkeydown={onKeydown}
		onblur={() => setTimeout(closeIfFocusLeft, BLUR_CLOSE_MS)}
		class={className}
	/>

	{#if open && matches.length > 0}
		<ul
			id={id ? `${id}-listbox` : undefined}
			role="listbox"
			data-testid="combobox-listbox"
			class="absolute left-0 z-30 max-h-48 w-full min-w-[10rem] overflow-y-auto rounded-app border border-border bg-card p-1 shadow-pop {placement ===
			'above'
				? 'bottom-full mb-1'
				: 'top-full mt-1'}"
		>
			{#each matches as option, i (option)}
				<li role="none">
					<button
						type="button"
						role="option"
						aria-selected={i === highlighted}
						onmousedown={(e) => {
							e.preventDefault();
							pick(option);
						}}
						onmouseenter={() => (highlighted = i)}
						class="w-full truncate rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
					>
						{option}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
