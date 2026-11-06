/*
 * The keyboard of a tab list (docs/05 §5.7, WAI-ARIA tabs pattern): only the chosen tab is a
 * Tab stop, and left and right step along the list, wrapping at either end.
 */

/** The tab an arrow key moves to from `chosen`, or `null` for a key the tab list leaves alone. */
export function tabAfterKey<T>(tabs: readonly T[], chosen: T, key: string): T | null {
	if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
	const at = tabs.indexOf(chosen) + (key === 'ArrowRight' ? 1 : -1);
	return tabs[(at + tabs.length) % tabs.length] ?? null;
}
