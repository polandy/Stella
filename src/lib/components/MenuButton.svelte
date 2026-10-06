<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import {
		menuMaxHeight,
		menuOpensUpward,
		menuShift,
		nearMiss,
		nextMenuIndex,
		type Band,
		type Span
	} from '$lib/menu/menu';

	/*
	 * A pill that opens a small menu below it (docs/05 §5.8) — the graph toolbar's Filter and
	 * Arrange. The menu floats over the canvas and takes no room of its own. It follows the
	 * menu-button pattern: the arrow keys move between items, Escape closes and hands focus
	 * back to the pill, and a click anywhere else closes it — bar a near miss just outside the edge. The items are the caller's, marked
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
		/**
		 * `pill` is the small rounded toggle of a toolbar; `button` frames the trigger like a
		 * secondary button and drops the chevron, for a ⋯ beside a screen's own actions — the
		 * person page's identity card (docs/05 §5.5).
		 */
		look?: 'pill' | 'button';
	}

	let {
		label,
		trigger,
		children,
		highlighted = false,
		align = 'start',
		look = 'pill'
	}: Props = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement>();
	let pill = $state<HTMLButtonElement>();
	let menu = $state<HTMLDivElement>();
	/** Sideways, in pixels, so an open menu stays on the map it floats over. */
	let shift = $state(0);
	/** Set when there is no room below the pill, e.g. at the foot of a phone's sheet. */
	let upward = $state(false);
	/** The most the menu may grow before it scrolls, so it stays on the map it floats over. */
	let maxHeight = $state<number | null>(null);

	/** Room kept between an open menu and the edge of what shows it. */
	const EDGE_MARGIN = 12;
	/** Between the pill and its menu: the `mt-1.5` / `mb-1.5` below. */
	const PILL_GAP = 6;

	/**
	 * What can show the menu: the nearest box that cuts off what overflows it (the map is one),
	 * within the window.
	 */
	function visibleSpan(from: HTMLElement): Span {
		const span = { left: 0, right: document.documentElement.clientWidth };
		for (let el = from.parentElement; el; el = el.parentElement) {
			if (getComputedStyle(el).overflowX === 'visible') continue;
			const box = el.getBoundingClientRect();
			return { left: Math.max(span.left, box.left), right: Math.min(span.right, box.right) };
		}
		return span;
	}

	/**
	 * The part of the screen actually showing — which an open phone keyboard shortens — within
	 * the nearest box that cuts off what overflows it, as the small map on a person's page does.
	 */
	function visibleBand(from: HTMLElement): Band {
		const view = window.visualViewport;
		const band = view
			? { top: view.offsetTop, bottom: view.offsetTop + view.height }
			: { top: 0, bottom: window.innerHeight };
		for (let el = from.parentElement; el; el = el.parentElement) {
			if (getComputedStyle(el).overflowY === 'visible') continue;
			const box = el.getBoundingClientRect();
			return { top: Math.max(band.top, box.top), bottom: Math.min(band.bottom, box.bottom) };
		}
		return band;
	}

	const items = () => (menu ? [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')] : []);

	async function show(focus: 'first' | 'last' = 'first') {
		shift = 0;
		upward = false;
		maxHeight = null;
		open = true;
		await tick();
		if (menu && root) {
			const pillBox = root.getBoundingClientRect();
			const band = visibleBand(root);
			shift = menuShift(menu.getBoundingClientRect(), visibleSpan(root), EDGE_MARGIN);
			upward = menuOpensUpward(pillBox, menu.offsetHeight, band, EDGE_MARGIN);
			maxHeight = menuMaxHeight(pillBox, upward, band, EDGE_MARGIN, PILL_GAP);
		}
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
		const next = nextMenuIndex(
			all.indexOf(document.activeElement as HTMLElement),
			all.length,
			event.key
		);
		if (next === null) return;
		event.preventDefault();
		all[next].focus();
	}

	/** How far outside the menu a tap still counts as a thumb that missed an item (docs/05 §5.8). */
	const NEAR_MISS = 16;

	function onWindowPointerdown(event: PointerEvent) {
		if (!open || !root || root.contains(event.target as Node)) return;
		const tap = { x: event.clientX, y: event.clientY };
		if (menu && nearMiss(menu.getBoundingClientRect(), tap, NEAR_MISS)) return;
		close(false);
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<div bind:this={root} class="pointer-events-auto relative">
	{#if look === 'button'}
		<button
			bind:this={pill}
			type="button"
			aria-haspopup="menu"
			aria-expanded={open}
			aria-label={label}
			title={label}
			onclick={() => (open ? close() : void show())}
			onkeydown={onPillKeydown}
			class="grid size-9 place-items-center rounded-control border border-border bg-card text-fg shadow-card transition-colors hover:bg-card-hover"
		>
			{@render trigger()}
		</button>
	{:else}
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
				? 'background:color-mix(in srgb, var(--primary) 18%, var(--card)); color:var(--fg)'
				: ''}
		>
			{@render trigger()}
			<svg class="size-2.5 opacity-70" viewBox="0 0 10 10" aria-hidden="true">
				<path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
			</svg>
		</button>
	{/if}

	{#if open}
		<div
			bind:this={menu}
			role="menu"
			tabindex="-1"
			aria-label={label}
			onkeydown={onMenuKeydown}
			class="absolute z-30 grid min-w-56 gap-0.5 overflow-y-auto overscroll-contain rounded-app border border-border bg-card p-1.5 shadow-pop"
			class:top-full={!upward}
			class:mt-1.5={!upward}
			class:bottom-full={upward}
			class:mb-1.5={upward}
			class:left-0={align === 'start'}
			class:right-0={align === 'end'}
			style:translate={shift ? `${shift}px 0` : undefined}
			style:max-height={maxHeight === null ? undefined : `${maxHeight}px`}
		>
			{@render children({ close })}
		</div>
	{/if}
</div>
