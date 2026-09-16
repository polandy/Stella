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

/** One claim answered in this visit. */
export interface AnsweredClaim {
	answer: 'accept' | 'decline';
	/** The undo window closed and the answer went through; the row may go for good. */
	committed: boolean;
}

/** Claims answered in this visit, keyed by `answerKey`. Undone claims are removed. */
export type AnsweredClaims = Record<string, AnsweredClaim>;

/** How many claims have left the list — held and sent alike, since the reader sees no difference. */
export const answeredCount = (answered: AnsweredClaims): number => Object.keys(answered).length;

/** True when every one of these claims was answered *and* sent, so the group is done with. */
export const allSent = (answered: AnsweredClaims, keys: readonly string[]): boolean =>
	keys.length > 0 && keys.every((key) => answered[key]?.committed === true);
