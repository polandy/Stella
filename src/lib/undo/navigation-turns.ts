/*
 * Which of the navigations a layout has seen is the latest (docs/04 §4.9). The layout holds a
 * navigation back while it sends the pending removals and issues it again afterwards; by then
 * the reader may have gone somewhere else, and issuing the old one would take them back.
 */

/** Hands out one turn per navigation; a turn is current until the next one is taken. */
export interface NavigationTurns {
	/** Take the turn for a navigation starting now; ask the result whether it is still latest. */
	take(): () => boolean;
}

export function navigationTurns(): NavigationTurns {
	let latest = 0;
	return {
		take() {
			const mine = ++latest;
			return () => mine === latest;
		}
	};
}
