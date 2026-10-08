import { describe, expect, it } from 'bun:test';
import { alreadyGiven, type GiftOnRecord } from './already-given';

/*
 * The *already given* hint (docs/02 §2.25.2): a title being typed that matches a gift already
 * given to the same person — case and accents folded, either inside the other — names that
 * gift, so the same book does not arrive twice. A hint, never a block.
 */

function gift(over: Partial<GiftOnRecord>): GiftOnRecord {
	return {
		id: 'g1',
		state: 'given',
		title: 'Teekanne aus Gusseisen',
		givenOn: '2023-10-12',
		occasion: 'birthday',
		...over
	};
}

describe('alreadyGiven', () => {
	it('finds a given gift whose title holds what is typed, case and accents folded', () => {
		const teapot = gift({});
		expect(alreadyGiven('teekanne', [teapot])).toBe(teapot);
		expect(alreadyGiven('  GUSSEISEN ', [teapot])).toBe(teapot);
		expect(alreadyGiven('Hörbuch', [gift({ title: 'Horbuch-Player' })])?.title).toBe(
			'Horbuch-Player'
		);
	});

	it('finds a given gift whose title is held in what is typed', () => {
		const tea = gift({ title: 'Tee' });
		expect(alreadyGiven('Tee aus Ceylon', [tea])).toBe(tea);
	});

	it('says nothing until three letters are typed, and nothing for a short title', () => {
		expect(alreadyGiven('te', [gift({})])).toBeNull();
		expect(alreadyGiven('', [gift({})])).toBeNull();
		// A two-letter gift would turn up in almost everything typed.
		expect(alreadyGiven('Puzzle mit Tieren', [gift({ title: 'Ti' })])).toBeNull();
	});

	it('only looks at what was given — not ideas, not what was received', () => {
		expect(alreadyGiven('teekanne', [gift({ state: 'idea', givenOn: null })])).toBeNull();
		expect(alreadyGiven('teekanne', [gift({ state: 'received' })])).toBeNull();
	});

	it('leaves out the gift being rewritten', () => {
		expect(alreadyGiven('teekanne', [gift({ id: 'g1' })], 'g1')).toBeNull();
	});

	it('names the latest of several matches', () => {
		const older = gift({ id: 'a', givenOn: '2021-12-24' });
		const newer = gift({ id: 'b', givenOn: '2024-12-24' });
		expect(alreadyGiven('teekanne', [older, newer])).toBe(newer);
		expect(alreadyGiven('teekanne', [newer, older])).toBe(newer);
	});

	it('finds nothing when nothing matches', () => {
		expect(alreadyGiven('Fotobuch', [gift({})])).toBeNull();
	});
});
