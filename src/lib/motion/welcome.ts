/*
 * The welcome on start (docs/05 §5.11.4): once per session, the logo's constellation comes
 * together and docks into the logo on the page.
 *
 * It has to run before the app's JavaScript has arrived, so it lives as inline SVG, CSS and
 * script in `src/app.html`, which cannot import anything. This module is the specification
 * that copy follows: the timings, whether a start is welcomed, and where the mark docks.
 * `welcome-overlay.test.ts` reads `app.html` and holds its copy to this one.
 */

import { MOTION } from '../design/tokens';

/** The `sessionStorage` key that says this tab or PWA window has been welcomed already. */
export const WELCOME_FLAG = 'stella-welcomed';

/** What a start shows: the animation, the finished mark standing still, or nothing. */
export type WelcomeMode = 'animate' | 'still' | 'skip';

/**
 * Whether this start is welcomed. `flag` is the session flag's value (`null` when unset): the
 * browser keeps it for one tab across reloads and the sign-in round trip, which is exactly
 * "once per session".
 */
export function shouldWelcome(flag: string | null, reducedMotion: boolean): WelcomeMode {
	if (flag !== null) return 'skip';
	return reducedMotion ? 'still' : 'animate';
}

/** When one part of the sequence starts and how long it takes, from the start of the page. */
export interface Span {
	delayMs: number;
	durationMs: number;
}

/**
 * The build-up, keyed by each part's class in `app.html`: `n-*` a node popping in, `t-*` the
 * thread drawn to that node, `halo` the ripple from the centre, `word` the wordmark rising.
 */
export const WELCOME_SEQUENCE = {
	'n-pink': { delayMs: 0, durationMs: 260 },
	't-mauve': { delayMs: 170, durationMs: 300 },
	't-blue': { delayMs: 200, durationMs: 300 },
	't-yellow': { delayMs: 220, durationMs: 300 },
	'n-mauve': { delayMs: 420, durationMs: 260 },
	'n-blue': { delayMs: 450, durationMs: 260 },
	'n-yellow': { delayMs: 480, durationMs: 260 },
	't-peach': { delayMs: 500, durationMs: 230 },
	word: { delayMs: 620, durationMs: 320 },
	'n-peach': { delayMs: 680, durationMs: 260 },
	halo: { delayMs: 700, durationMs: 520 }
} as const satisfies Record<string, Span>;

/**
 * The exit, from `startMs` on: the mark docks into the page's logo while the wordmark and the
 * backdrop fade — or, with no logo to dock into, the whole overlay fades in place.
 */
export const WELCOME_EXIT = {
	startMs: 1100,
	dockMs: 320,
	wordOutMs: 140,
	backdropMs: 260,
	fadeMs: MOTION.fadeMs
} as const;

/** How long the finished mark stands under reduced motion, before it goes without a fade. */
export const WELCOME_STILL_MS = 600;

/** When the animated welcome is over: the moment the mark lands on the logo. */
export function welcomeEndMs(): number {
	return WELCOME_EXIT.startMs + Math.max(WELCOME_EXIT.dockMs, WELCOME_EXIT.fadeMs);
}

/** A box on screen, as `getBoundingClientRect` gives it. */
export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** The move that lays the mark onto a logo: its centre shifted by `dx`/`dy`, then scaled. */
export interface DockMove {
	dx: number;
	dy: number;
	scale: number;
}

/**
 * Where the mark docks: onto the first of the page's logos that is laid out and on screen —
 * a breakpoint's `display: none` measures as an empty box. `null` when there is none, or the
 * mark itself cannot be measured: the overlay then fades in place.
 */
export function dockMove(
	mark: Box,
	logos: readonly Box[],
	viewport: { width: number; height: number }
): DockMove | null {
	if (!(mark.width > 0 && mark.height > 0)) return null;
	const logo = logos.find(
		(box) =>
			box.width > 0 &&
			box.height > 0 &&
			box.left < viewport.width &&
			box.left + box.width > 0 &&
			box.top < viewport.height &&
			box.top + box.height > 0
	);
	if (!logo) return null;
	return {
		dx: logo.left + logo.width / 2 - (mark.left + mark.width / 2),
		dy: logo.top + logo.height / 2 - (mark.top + mark.height / 2),
		scale: logo.width / mark.width
	};
}
