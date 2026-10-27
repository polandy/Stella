import { describe, expect, it } from 'bun:test';
import type { ReviewCard, ReviewKind } from './review';
import {
	answer,
	confirmSure,
	initialReview,
	inShowingOrder,
	openSure,
	reopen,
	skipRest,
	takeCardSide,
	unanswer,
	unanswered
} from './review';

/*
 * The review step's state in the browser (docs/02 §2.16): a sure match starts as *Same
 * person*, one button folds all of them, *Skip the rest* answers what is left, and the import
 * waits until every card has an answer.
 */

const reviewCard = (key: string, kind: ReviewKind, people: string[] = []): ReviewCard => ({
	kind,
	card: {
		key,
		firstName: null,
		lastName: null,
		displayName: key,
		nickname: null,
		company: null,
		jobTitle: null,
		birthday: null,
		emails: [],
		phones: [],
		addresses: [],
		urls: [],
		tags: [],
		photo: null
	},
	candidates: people.map((personId) => ({
		personId,
		displayName: personId,
		birthday: null,
		reasons: [],
		plan: { add: [], conflicts: [], kept: [] }
	}))
});

const CARDS = [
	reviewCard('anna', 'strong', ['p-anna']),
	reviewCard('bruno', 'linked', ['p-bruno']),
	reviewCard('david', 'weak', ['p-david']),
	reviewCard('eva', 'several', ['p-eva1', 'p-eva2']),
	reviewCard('felix', 'none')
];

describe('the review state', () => {
	it('starts every sure card as Same person, open, and asks about the rest', () => {
		const state = initialReview(CARDS);

		expect(state.answers).toEqual({
			anna: { kind: 'same', personId: 'p-anna', takeCard: [] },
			bruno: { kind: 'same', personId: 'p-bruno', takeCard: [] }
		});
		expect(state.closed).toEqual({});
		expect(unanswered(state, CARDS).map((c) => c.card.key)).toEqual(['david', 'eva', 'felix']);
	});

	it('folds all sure matches in one go, leaving a changed one alone', () => {
		let state = initialReview(CARDS);
		state = answer(state, 'bruno', { kind: 'new' });
		state = reopen(state, 'bruno');

		expect(openSure(state, CARDS).map((c) => c.card.key)).toEqual(['anna']);
		state = confirmSure(state, CARDS);

		expect(state.closed).toEqual({ anna: true });
		expect(openSure(state, CARDS)).toEqual([]);
		expect(inShowingOrder(state, CARDS).map((c) => c.card.key)).toEqual([
			'bruno',
			'david',
			'eva',
			'felix',
			'anna'
		]);
	});

	it('answers what is left Skip, and nothing already answered', () => {
		let state = answer(initialReview(CARDS), 'felix', { kind: 'new' });

		state = skipRest(state, CARDS);

		expect(unanswered(state, CARDS)).toEqual([]);
		expect(state.answers.felix).toEqual({ kind: 'new' });
		expect(state.answers.david).toEqual({ kind: 'skip' });
		expect(state.answers.anna?.kind).toBe('same');
		expect(state.closed).toMatchObject({ david: true, eva: true, felix: true });
	});

	it('takes the card’s side of a conflict and gives it back', () => {
		let state = initialReview(CARDS);

		state = takeCardSide(state, 'anna', 'birthday', true);
		state = takeCardSide(state, 'anna', 'lastName', true);
		state = takeCardSide(state, 'anna', 'birthday', false);

		expect(state.answers.anna).toEqual({
			kind: 'same',
			personId: 'p-anna',
			takeCard: ['lastName']
		});
		// A card that is not Same person has no conflicts to choose.
		expect(takeCardSide(state, 'felix', 'birthday', true)).toBe(state);
	});

	it('opens a card again with its answer taken back', () => {
		let state = answer(initialReview(CARDS), 'eva', {
			kind: 'same',
			personId: 'p-eva2',
			takeCard: []
		});

		state = unanswer(state, 'eva');

		expect(state.answers.eva).toBeUndefined();
		expect(state.closed.eva).toBeUndefined();
	});
});
