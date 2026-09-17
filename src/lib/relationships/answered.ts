/*
 * Claims answered during one visit to a review (docs/02 §2.4.1, §2.23).
 *
 * An answer passes through two states that look alike from the outside and must not be
 * confused: *held*, while its undo window is open and the row is still on screen, and *sent*,
 * once the window closed and the write went out. Both have left the reader's list, so both
 * count against the header; only a sent one may take its row and its person off the page.
 *
 * Told apart here rather than in a component, because "answered and no longer held" is true of
 * an undone answer too — reading it as *sent* makes a row vanish that was just taken back.
 */

/**
 * Where an answer has got to.
 *
 * `held` while its undo window is open, `sending` from the moment the window closed until the
 * request comes back, `sent` once it did. The middle one is not a nicety: the store stops
 * calling a removal pending the instant the window closes, so without it a claim on its way to
 * the server is indistinguishable from one that was taken back.
 */
export type AnswerState = 'held' | 'sending' | 'sent';

/** One claim answered in this visit. */
export interface AnsweredClaim {
	answer: 'accept' | 'decline';
	state: AnswerState;
}

/** Claims answered in this visit, keyed by `answerKey`. Undone claims are removed. */
export type AnsweredClaims = Record<string, AnsweredClaim>;

/** How many claims have left the list — held and sent alike, since the reader sees no difference. */
export const answeredCount = (answered: AnsweredClaims): number => Object.keys(answered).length;

/** True when every one of these claims was answered *and* sent, so the group is done with. */
export const allSent = (answered: AnsweredClaims, keys: readonly string[]): boolean =>
	keys.length > 0 && keys.every((key) => answered[key]?.state === 'sent');

/**
 * Whether this answer was taken back, given whether the store still holds it.
 *
 * *Undo* is pressed in the toast, which knows nothing about the list — so the way back is
 * observed rather than reported. Only a claim still `held` can have been taken back: one that
 * is `sending` also stopped being pending, and reading that as an undo puts an answered row
 * back on screen while its write is in flight.
 */
export const wasTakenBack = (claim: AnsweredClaim, stillPending: boolean): boolean =>
	!stillPending && claim.state === 'held';
