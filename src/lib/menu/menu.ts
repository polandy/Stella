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
