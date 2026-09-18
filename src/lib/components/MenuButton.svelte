<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { nextMenuIndex } from '$lib/menu/menu';

	/*
	 * A pill that opens a small menu below it (docs/05 §5.8) — the graph toolbar's Filter and
	 * Arrange. The menu floats over the canvas and takes no room of its own. It follows the
	 * menu-button pattern: the arrow keys move between items, Escape closes and hands focus
	 * back to the pill, and a click anywhere else closes it. The items are the caller's, marked
	 * `role="menuitemcheckbox"` or `"menuitemradio"`; the caller closes the menu after a choice
	 * that ends it, and leaves it open for one of several toggles.
	 */
	interface Props {
		/** Accessible name of the pill, which says more than its short visible text. */
		label: string;
		/** What the pill shows. */
		trigger: Snippet;
		/** The items, handed a way to close the menu once a choice ends it. */
		children: Snippet<[{ close: () => void }]>;
		/** Marks the pill as holding something the reader changed, e.g. a narrowed filter. */
		highlighted?: boolean;
		/** Which edge of the pill the menu lines up with. */
		align?: 'start' | 'end';
	}

	let { label, trigger, children, highlighted = false, align = 'start' }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement>();
	let pill = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();

	const items = () =>
		menu ? [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : [];

	async function show(focus: 'first' | 'last' = 'first') {
		open = true;
		await tick();
		const all = items();
		(focus === 'first' ? all[0] : all[all.length - 1])?.focus();
	}

	function close(returnFocus = true) {
		open = false;
		if (returnFocus) pill?.focus();
	}

	function onPillKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		void show(event.key === 'ArrowDown' ? 'first' : 'last');
	}

	function onMenuKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === 'Tab') {
			close(false);
			return;
		}
		const all = items();
		const next = nextMenuIndex(all.indexOf(document.activeElement as HTMLElement), all.length, event.key);
		if (next === null) return;
		event.preventDefault();
		all[next].focus();
	}

	function onWindowPointerdown(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) close(false);
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<div bind:this={root} class="pointer-events-auto relative">
	<button
		bind:this={pill}
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open ? close() : void show())}
		onkeydown={onPillKeydown}
		class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur transition-colors hover:text-fg"
		class:border-border={!highlighted}
		class:bg-card={!highlighted}
		class:text-fg-muted={!highlighted}
		class:border-transparent={highlighted}
		style={highlighted
			? 'background:color-mix(in srgb, var(--primary) 18%, var(--card)); color:var(--primary)'
			: ''}
	>
		{@render trigger()}
		<svg class="size-2.5 opacity-70" viewBox="0 0 10 10" aria-hidden="true">
			<path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={menu}
			role="menu"
			tabindex="-1"
			aria-label={label}
			onkeydown={onMenuKeydown}
			class="absolute top-full z-30 mt-1.5 grid min-w-56 gap-0.5 rounded-app border border-border bg-card p-1.5 shadow-pop"
			class:left-0={align === 'start'}
			class:right-0={align === 'end'}
		>
			{@render children({ close })}
		</div>
	{/if}
</div>
