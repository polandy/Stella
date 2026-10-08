/*
 * The decisions behind a toolbar menu (docs/05 §5.8), kept out of the component so they test
 * without a browser: what a Filter button says about what is shown, and where the arrow keys
 * move inside an open menu.
 */

/** What a Filter button shows: how many kinds are on, and whether the reader narrowed them. */
export interface FilterSummary {
	shown: number;
	total: number;
	/**
	 * Whether what is shown differs from what the map opened with. A map that opens with
	 * something off (the person page's circles) is not narrowed until the reader changes it,
	 * so the button only stands out once there is something the reader might have forgotten.
	 */
	narrowed: boolean;
}

/** Summarises `active` out of `all`, measured against what the map opened with. */
export function filterSummary(
	active: ReadonlySet<string>,
	all: readonly string[],
	opening: ReadonlySet<string>
): FilterSummary {
	const shown = all.filter((key) => active.has(key)).length;
	const narrowed = all.some((key) => active.has(key) !== opening.has(key));
	return { shown, total: all.length, narrowed };
}

/** Keys that move focus inside an open menu. */
const MOVES = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/**
 * The item a key moves focus to among `count` items, from `current` (-1 when none has focus
 * yet), wrapping at either end; null for a key that does not move focus.
 */
export function nextMenuIndex(current: number, count: number, key: string): number | null {
	if (!MOVES.has(key) || count === 0) return null;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	if (current < 0) return key === 'ArrowDown' ? 0 : count - 1;
	const step = key === 'ArrowDown' ? 1 : -1;
	return (current + step + count) % count;
}

/** A horizontal stretch of the screen, in pixels. */
export interface Span {
	left: number;
	right: number;
}

/**
 * How far to move an open menu sideways so it stays inside `bounds`, `margin` clear of each
 * edge: a pill near the edge of a phone's map opens a menu wider than the room beside it. Too
 * wide to fit either way, the menu keeps its start in view, where its first items are.
 */
export function menuShift(menu: Span, bounds: Span, margin: number): number {
	const pastRight = menu.right - (bounds.right - margin);
	let shift = pastRight > 0 ? -pastRight : 0;
	const pastLeft = bounds.left + margin - (menu.left + shift);
	if (pastLeft > 0) shift += pastLeft;
	return shift;
}

/** A vertical stretch of the screen, in pixels. */
export interface Band {
	top: number;
	bottom: number;
}

/**
 * Whether a menu `height` tall opens above its pill rather than below: only when it would run
 * past the foot of `bounds` and there is more room above — the composer's day pill sits at the
 * bottom of a phone's sheet, where a menu below would open off the screen.
 */
export function menuOpensUpward(pill: Band, height: number, bounds: Band, margin: number): boolean {
	const below = bounds.bottom - margin - pill.bottom;
	const above = pill.top - (bounds.top + margin);
	return height > below && above > below;
}

/**
 * How tall an open menu may grow on the side it opens to, so its foot (or top) stays inside
 * `bounds`, `margin` clear of the edge, `gap` apart from its pill. A menu taller than that
 * scrolls instead: on the small map of a person's page the Filter menu is taller than the map,
 * and the map cuts off whatever runs past it.
 */
export function menuMaxHeight(
	pill: Band,
	upward: boolean,
	bounds: Band,
	margin: number,
	gap: number
): number {
	const room = upward
		? pill.top - gap - (bounds.top + margin)
		: bounds.bottom - margin - pill.bottom - gap;
	return Math.max(0, room);
}

/**
 * Whether a tap outside an open menu landed within `margin` of its edge. Such a tap aimed at
 * an item near the edge and missed by a thumb's width; closing the menu for it threw away the
 * reader's place, so only a tap further out closes.
 */
export function nearMiss(
	menu: { left: number; top: number; right: number; bottom: number },
	tap: { x: number; y: number },
	margin: number
): boolean {
	return (
		tap.x >= menu.left - margin &&
		tap.x <= menu.right + margin &&
		tap.y >= menu.top - margin &&
		tap.y <= menu.bottom + margin
	);
}
