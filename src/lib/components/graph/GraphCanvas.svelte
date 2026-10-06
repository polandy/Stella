<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { graphKeyAction } from '$lib/graph/keyboard';
	import type { Point } from '$lib/graph/layout/geometry';
	import type { RoleGroup, RoleGrouping } from '$lib/graph/model/role-groups';

	/*
	 * The element the canvas is drawn into, and the keyboard's way around it (docs/05 §5.8):
	 * the focus frame, the hint, and the line that announces who the keyboard is on. What is
	 * drawn, and how, stays with the explorer; this only hosts it.
	 */
	interface Props {
		/** The element the renderer draws into, handed back to the explorer. */
		container?: HTMLDivElement;
		/** The canvas is built; until then it says it is loading and is out of the tab order. */
		ready: boolean;
		selected: string | null;
		centerId: string | null;
		grouping: RoleGrouping | null;
		groupLabel: (group: RoleGroup) => string;
		nameOf: (id: string) => string;
		/** The "+N" on each node that can still grow. */
		hidden: ReadonlyMap<string, number>;
		/** Where everyone shown stands on the canvas right now. */
		positions: () => ReadonlyMap<string, Point>;
		/** Ring the node the keyboard is on (null clears). */
		markCursor: (id: string | null) => void;
		/** Enter on somebody: what a click on them does. */
		onActivate: (id: string) => Promise<void>;
		/** Escape: let go of what is selected or being picked. */
		onClear: () => void;
	}
	let {
		container = $bindable(),
		ready,
		selected,
		centerId,
		grouping,
		groupLabel,
		nameOf,
		hidden,
		positions,
		markCursor,
		onActivate,
		onClear
	}: Props = $props();

	const t = useTranslate();
	const uid = $props.id();
	const hintId = `${uid}-keyboard-hint`;

	/*
	 * Walking the map from the keyboard (docs/05 §5.8). The cursor is where the keyboard is,
	 * apart from the selection: stepping past people must not select each one in turn, which
	 * would re-highlight the map on every key. Enter on it does what a click does.
	 */
	let cursor = $state<string | null>(null);
	/** The canvas holds keyboard focus; its drawn children cover an outline, so a frame shows it. */
	let keyboardOnCanvas = $state(false);
	const cursorLabel = $derived.by(() => {
		if (cursor === null) return '';
		const group = grouping?.groups.find((g) => g.id === cursor);
		const plain = group ? groupLabel(group) : nameOf(cursor);
		// The "+N" badge is drawn on the canvas; a screen reader hears it with the name.
		const more = hidden.get(cursor) ?? 0;
		const name = more > 0 ? t('graph.keyboard.more', { name: plain, count: more }) : plain;
		return cursor === selected ? t('graph.keyboard.selected', { name }) : name;
	});

	function placeCursor(id: string | null) {
		cursor = id;
		markCursor(id);
	}

	const keyFor = (key: string) =>
		graphKeyAction({
			key,
			cursor,
			positions: positions(),
			start: selected ?? centerId
		});

	function onCanvasFocus() {
		// A click focuses the canvas too; only the keyboard's arrival shows where it is.
		if (!container?.matches(':focus-visible')) return;
		keyboardOnCanvas = true;
		const home = keyFor('Home');
		if (home?.kind === 'move') placeCursor(cursor ?? home.to);
	}

	async function onCanvasKeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const action = keyFor(event.key);
		if (!action) return;
		event.preventDefault();
		keyboardOnCanvas = true;
		if (action.kind === 'move') placeCursor(action.to);
		else if (action.kind === 'activate') await onActivate(action.id);
		else if (action.kind === 'clear') onClear();
	}
</script>

<!-- Cytoscape stamps `position: relative` on its container, which would cancel an
     `absolute inset-0` box and collapse the canvas to zero height — size it directly.
     `touch-none`: Cytoscape reads every pan/zoom gesture itself; left to the browser's own
     default, a pan can be read as an edge-swipe or chrome-reveal gesture instead. -->
<!-- The canvas is one stop in the tab order and is walked with the arrow keys (docs/05
     §5.8); the person under the keyboard is announced, since the canvas has no text.
     `svelte-ignore`: Svelte counts `application` as non-interactive, yet it is the role that
     hands the arrow keys to this element rather than to a screen reader's reading mode. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={container}
	class="h-full w-full touch-none focus:outline-none"
	tabindex={ready ? 0 : -1}
	role="application"
	aria-label={t('graph.canvas')}
	aria-describedby={hintId}
	onfocus={onCanvasFocus}
	onblur={() => {
		keyboardOnCanvas = false;
		markCursor(null);
	}}
	onkeydown={onCanvasKeydown}
></div>
{#if keyboardOnCanvas}
	<div
		class="pointer-events-none absolute inset-0 ring-2 ring-focus-ring ring-inset"
		aria-hidden="true"
	></div>
{/if}
<p id={hintId} class="sr-only">{t('graph.keyboard.hint')}</p>
<p class="sr-only" aria-live="polite">{cursorLabel}</p>

{#if !ready}
	<div class="absolute inset-0 grid place-items-center text-sm text-fg-subtle">
		{t('graph.loading')}
	</div>
{/if}
