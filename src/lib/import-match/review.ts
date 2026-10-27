import type { PartialDate } from '../dates/partial-date';
import type { MatchReason } from './candidates';
import type { ContactSource, IncomingCard } from './card';
import type { Conflict, MergePlan } from './merge-plan';

/*
 * The matching review as the wizard shows it (docs/02 §2.16): the cards the server says need
 * an answer, and the member's answers while they give them. Pure, so the browser's state is
 * unit-tested here and the Svelte component only renders it.
 */

/** Why a card is asked about. `linked` is a card linked before that changed since. */
export type ReviewKind = 'linked' | 'strong' | 'weak' | 'several' | 'none';

/** A person the card may be, with what *Same person* would do to them. */
export interface ReviewCandidate {
	personId: string;
	displayName: string;
	birthday: PartialDate | null;
	reasons: MatchReason[];
	plan: MergePlan;
}

/** One card of the review: the contact as it arrives, and who it may be. */
export interface ReviewCard {
	kind: ReviewKind;
	card: Omit<IncomingCard, 'hash'>;
	/** The likeliest first; one for linked, strong and weak, none for a new one. */
	candidates: ReviewCandidate[];
}

/** What the review step is handed. */
export interface ContactReview {
	source: ContactSource;
	/** Cards in the file. */
	total: number;
	/** Cards answered before and unchanged since, so not asked about again. */
	settled: number;
	/** Of the cards in the file, those skipped before. */
	skippedBefore: number;
	/** Cards whose picture is only a link, which is never fetched. */
	linkPhotos: number;
	cards: ReviewCard[];
}

/** The member's answer for one card, as the server applies it. */
export type ReviewAnswer =
	| {
			kind: 'same';
			personId: string;
			/** The conflicts where the card's side is taken; Stella's stays for the rest. */
			takeCard: readonly Conflict['kind'][];
	  }
	| { kind: 'new' }
	| { kind: 'skip' };

/** The review while the member answers it. */
export interface ReviewState {
	answers: Readonly<Record<string, ReviewAnswer>>;
	/** Cards folded to one line; an answer folds its card, *Change* opens it again. */
	closed: Readonly<Record<string, true>>;
}

/** Whether *Same person* is offered without a choice: one person it surely is. */
const isSure = (c: ReviewCard) => c.kind === 'strong' || c.kind === 'linked';

/** A sure card starts as *Same person*, still open so its conflicts can be looked at. */
export function initialReview(cards: readonly ReviewCard[]): ReviewState {
	const answers: Record<string, ReviewAnswer> = {};
	for (const c of cards) {
		const person = c.candidates[0];
		if (isSure(c) && person) {
			answers[c.card.key] = { kind: 'same', personId: person.personId, takeCard: [] };
		}
	}
	return { answers, closed: {} };
}

const without = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> => {
	const rest = { ...record };
	delete rest[key];
	return rest;
};

/** Answer one card, which folds it. */
export function answer(state: ReviewState, key: string, given: ReviewAnswer): ReviewState {
	return {
		answers: { ...state.answers, [key]: given },
		closed: { ...state.closed, [key]: true }
	};
}

/** Take back a card's answer: a choice between people was changed, so it is open again. */
export function unanswer(state: ReviewState, key: string): ReviewState {
	return { answers: without(state.answers, key), closed: without(state.closed, key) };
}

/** Open a folded card again, its answer kept. */
export function reopen(state: ReviewState, key: string): ReviewState {
	return { ...state, closed: without(state.closed, key) };
}

/** Take the card's side of one conflict, or Stella's again. */
export function takeCardSide(
	state: ReviewState,
	key: string,
	kind: Conflict['kind'],
	take: boolean
): ReviewState {
	const current = state.answers[key];
	if (current?.kind !== 'same') return state;
	const rest = current.takeCard.filter((k) => k !== kind);
	return {
		...state,
		answers: { ...state.answers, [key]: { ...current, takeCard: take ? [...rest, kind] : rest } }
	};
}

/** The sure cards still open as *Same person*: what *Confirm all strong matches* folds. */
export function openSure(state: ReviewState, cards: readonly ReviewCard[]): ReviewCard[] {
	return cards.filter(
		(c) => isSure(c) && state.answers[c.card.key]?.kind === 'same' && !state.closed[c.card.key]
	);
}

/** Fold every sure card left as *Same person*. */
export function confirmSure(state: ReviewState, cards: readonly ReviewCard[]): ReviewState {
	const closed: Record<string, true> = { ...state.closed };
	for (const c of openSure(state, cards)) closed[c.card.key] = true;
	return { ...state, closed };
}

/** The cards without an answer yet. */
export const unanswered = (state: ReviewState, cards: readonly ReviewCard[]): ReviewCard[] =>
	cards.filter((c) => !state.answers[c.card.key]);

/** Answer every card still without one *Skip*. */
export function skipRest(state: ReviewState, cards: readonly ReviewCard[]): ReviewState {
	let next = state;
	for (const c of unanswered(state, cards)) next = answer(next, c.card.key, { kind: 'skip' });
	return next;
}

/** Open cards first, in the server's order, then the folded ones. */
export const inShowingOrder = (state: ReviewState, cards: readonly ReviewCard[]): ReviewCard[] => [
	...cards.filter((c) => !state.closed[c.card.key]),
	...cards.filter((c) => state.closed[c.card.key])
];
