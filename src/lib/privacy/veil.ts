/*
 * The private-entry veil (docs/02 §2.10.1): the title, text and picture of a member's own
 * private entries stay blurred on their screen until they ask for them, so a glance over the
 * shoulder shows *that* something private is there, never *what*. It guards the screen, not the
 * data: the access layer already keeps everyone else out.
 *
 * Pure: the state is a value, every step returns a new one, and "now" is handed in.
 */

/** How long one reveal of everything lasts. */
export const WINDOW_MS = 5 * 60_000;

export interface VeilState {
	/** Entries shown by a tap of their own, until the page is left. */
	readonly tapped: ReadonlySet<string>;
	/** When the window that shows everything ends; null while none is open. */
	readonly openUntil: number | null;
}

/** Everything blurred: how a tab starts, and what locking or the background returns to. */
export const LOCKED: VeilState = { tapped: new Set(), openUntil: null };

/** Whether device unlock can ask for the fingerprint, face or PIN on this device. */
export type UnlockStatus = 'checking' | 'unsupported' | 'none' | 'set-up';

export function windowOpen(state: VeilState, now: number): boolean {
	return state.openUntil !== null && now < state.openUntil;
}

/** Whether a private entry's content is blurred right now. Shared entries never are. */
export function isVeiled(state: VeilState, id: string, enabled: boolean, now: number): boolean {
	if (!enabled) return false;
	return !windowOpen(state, now) && !state.tapped.has(id);
}

/** Shown by its own tap, outside a window: the entry offers a *Hide* beside its mark. */
export function isTapped(state: VeilState, id: string, now: number): boolean {
	return state.tapped.has(id) && !windowOpen(state, now);
}

export function showOne(state: VeilState, id: string): VeilState {
	return { ...state, tapped: new Set(state.tapped).add(id) };
}

export function hideOne(state: VeilState, id: string): VeilState {
	const tapped = new Set(state.tapped);
	tapped.delete(id);
	return { ...state, tapped };
}

export function openWindow(state: VeilState, now: number): VeilState {
	return { ...state, openUntil: now + WINDOW_MS };
}

/** A tap shows an entry until the page is left; the window goes on across pages. */
export function leavePage(state: VeilState): VeilState {
	return { ...state, tapped: new Set() };
}

/** The header lock tapped again, or Stella sent to the background: nothing stays open. */
export function lockAll(): VeilState {
	return LOCKED;
}

/**
 * What a reveal takes: with device unlock set up here, the device's own check first, and then
 * everything is shown for the window; without it a tap is enough.
 */
export function revealPath(unlock: UnlockStatus): 'verify' | 'tap' {
	return unlock === 'set-up' ? 'verify' : 'tap';
}

/** Whole seconds the window has left, rounded up so an open window never reads 0:00. */
export function secondsLeft(state: VeilState, now: number): number {
	if (!windowOpen(state, now) || state.openUntil === null) return 0;
	return Math.ceil((state.openUntil - now) / 1000);
}

/** `4:59`, as the header lock says it. */
export function timeLeftLabel(seconds: number): string {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const FILLER = 'loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididunt';
const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/** The words of rendered Markdown, with its tags dropped and a block ending as a line break. */
function textOf(html: string): string {
	return html
		.replace(/<\/(p|li|h\d|blockquote|pre)>\s*/gi, '\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (entity, name: string) => {
			if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity;
			const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
			return String.fromCodePoint(code);
		})
		.trim();
}

/**
 * Stand-in text the length and shape of the real one, every word kept as long, none of it
 * kept. Blurred it looks like the entry; and since the real words are not on the page while
 * veiled, the browser's find-in-page cannot land on them.
 */
export function placeholderFor(text: string | null | undefined): string {
	if (!text) return '';
	let next = 0;
	return Array.from(textOf(text), (char) =>
		/\s/.test(char) ? char : FILLER[next++ % FILLER.length]
	).join('');
}
