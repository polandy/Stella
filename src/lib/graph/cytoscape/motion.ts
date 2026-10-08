import type { Core, EventObject, Layouts } from 'cytoscape';

/*
 * Whether the canvas is still moving: every layout running and every glide under way. Written
 * onto the container while anything moves and when it has all come to rest, so a caller can
 * tell a canvas that is still moving from one that has come to rest — the e2e suite reads node
 * positions as soon as it says `settled` (`e2e/graph-canvas.ts`, docs/04 §4.11).
 */

const LAYOUT_STATE_ATTRIBUTE = 'data-layout';
const SETTLING = 'settling';
const SETTLED = 'settled';

/** Cytoscape hands the layout instance along with its own lifecycle events. */
interface LayoutEvent extends EventObject {
	layout: Layouts;
}

export interface Motion {
	/** Runs an animation that counts as the canvas moving until it completes. */
	whileMoving(start: (complete: () => void) => void): void;
	/**
	 * Runs `run` at once when the canvas is at rest, else once it comes to rest. Asked again
	 * before then, only the last one runs.
	 */
	afterSettling(run: () => void): void;
	/** Stops every layout still running, before the core goes. */
	stopLayouts(): void;
}

export function trackMotion(cy: Core): Motion {
	const container = cy.container();
	const setLayoutState = (state: string) => container?.setAttribute(LAYOUT_STATE_ATTRIBUTE, state);

	// Every layout still moving the nodes. Destroying the core does not stop a layout: its next
	// frame would run against a core whose renderer is already gone, throw there, and leave a
	// half-demolished canvas behind — which is what a page navigated away from mid-layout used
	// to do. There can be more than one, because tidying the map up re-arranges it while the
	// opening arrangement may still be travelling, and Cytoscape lets the two run side by side.
	const running = new Set<Layouts>();
	// Animations still under way from an expand — newcomers travelling out to their places, the
	// view stepping back to show them. Until they end the drawn positions are still moving,
	// just as during a layout.
	let moving = 0;
	// What waits for the canvas to come to rest.
	let onceSettled: (() => void) | undefined;
	const atRest = () => running.size === 0 && moving === 0;

	// Only the last layout to finish, with nothing else moving, has brought the canvas to rest;
	// the nodes an earlier layout left behind are still being moved by a later one.
	const publishLayoutState = () => {
		const settled = atRest();
		setLayoutState(settled ? SETTLED : SETTLING);
		if (settled && onceSettled) {
			const run = onceSettled;
			onceSettled = undefined;
			run();
		}
	};

	setLayoutState(SETTLING);
	cy.on('layoutstart', (e) => {
		running.add((e as LayoutEvent).layout);
		publishLayoutState();
	});
	cy.on('layoutstop', (e) => {
		running.delete((e as LayoutEvent).layout);
		publishLayoutState();
	});

	return {
		whileMoving(start) {
			moving++;
			publishLayoutState();
			start(() => {
				moving--;
				publishLayoutState();
			});
		},

		afterSettling(run) {
			if (atRest()) run();
			else onceSettled = run;
		},

		stopLayouts() {
			// A snapshot: stopping a layout makes it announce itself out of the set.
			for (const layout of [...running]) layout.stop();
			running.clear();
		}
	};
}
