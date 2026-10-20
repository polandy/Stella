import { describe, expect, it } from 'bun:test';
import {
	alsoIn,
	dragCarries,
	effectiveMode,
	pickKey,
	togglePick,
	toastFor,
	verdictFor,
	type ArrangeCardRef
} from './arrange';

/*
 * The arrange screen's decisions (docs/02 §2.4.2, ADR-127): what a drop would do, what a drag
 * carries, and the toast. Cards: School holds Keller and Lena, Class holds Lena and Mia.
 */

const cards: ArrangeCardRef[] = [
	{ circleId: 'school', name: 'School', contactIds: ['keller', 'lena'] },
	{ circleId: 'class', name: 'Class 1b', contactIds: ['lena', 'mia'] },
	{ circleId: 'football', name: 'Football', contactIds: [] }
];
const at = (circleId: string, contactId: string) => ({ circleId, contactId });

describe('togglePick', () => {
	it('adds a pick and takes it out again', () => {
		const one = togglePick([], at('class', 'mia'));
		expect(one).toEqual([at('class', 'mia')]);
		expect(togglePick(one, at('class', 'mia'))).toEqual([]);
	});

	it('tells the same person in two cards apart', () => {
		expect(pickKey(at('school', 'lena'))).not.toBe(pickKey(at('class', 'lena')));
		expect(togglePick([at('school', 'lena')], at('class', 'lena'))).toHaveLength(2);
	});
});

describe('dragCarries', () => {
	it('carries the whole selection when the dragged person is part of it', () => {
		const selection = [at('class', 'mia'), at('class', 'lena')];
		expect(dragCarries(selection, at('class', 'mia'))).toEqual(selection);
	});

	it('carries only the dragged person otherwise', () => {
		expect(dragCarries([at('class', 'mia')], at('school', 'keller'))).toEqual([
			at('school', 'keller')
		]);
	});
});

describe('effectiveMode', () => {
	it('flips with Alt and not without', () => {
		expect(effectiveMode('move', false)).toBe('move');
		expect(effectiveMode('move', true)).toBe('copy');
		expect(effectiveMode('copy', true)).toBe('move');
	});
});

describe('verdictFor', () => {
	it('counts the distinct people a move would take', () => {
		expect(verdictFor(cards, [at('class', 'mia')], 'football', 'move')).toEqual({
			ok: true,
			count: 1
		});
	});

	it('refuses a pick dropped on its own card, saying already here for one', () => {
		expect(verdictFor(cards, [at('class', 'mia')], 'class', 'move')).toEqual({
			ok: false,
			reason: 'alreadyHere'
		});
	});

	it('says everyone is already here for several', () => {
		expect(verdictFor(cards, [at('class', 'mia'), at('class', 'lena')], 'class', 'copy')).toEqual({
			ok: false,
			reason: 'alreadyAllHere'
		});
	});

	it('refuses a copy of someone who is in the target already', () => {
		expect(verdictFor(cards, [at('class', 'lena')], 'school', 'copy')).toEqual({
			ok: false,
			reason: 'alreadyHere'
		});
	});

	it('allows a move of someone in the target already: it clears the old place', () => {
		expect(verdictFor(cards, [at('class', 'lena')], 'school', 'move')).toEqual({
			ok: true,
			count: 1
		});
	});

	it('copies the newcomers of a mixed pick and counts every person picked', () => {
		expect(verdictFor(cards, [at('class', 'lena'), at('class', 'mia')], 'school', 'copy')).toEqual({
			ok: true,
			count: 2
		});
	});

	it('counts a person picked in two cards once', () => {
		expect(
			verdictFor(cards, [at('class', 'lena'), at('school', 'lena')], 'football', 'move')
		).toEqual({ ok: true, count: 1 });
	});
});

describe('alsoIn', () => {
	it('names the other cards that hold the person', () => {
		expect(alsoIn(cards, 'lena', 'class')).toEqual(['School']);
		expect(alsoIn(cards, 'mia', 'class')).toEqual([]);
	});
});

describe('toastFor', () => {
	it('reports what was added and how many were there already', () => {
		expect(toastFor({ mode: 'copy', addedCount: 2, alreadyThereCount: 1 })).toEqual({
			kind: 'done',
			mode: 'copy',
			count: 2,
			alreadyThere: 1
		});
	});

	it('reports a move that only cleared the old place', () => {
		expect(toastFor({ mode: 'move', addedCount: 0, alreadyThereCount: 3 })).toEqual({
			kind: 'onlyRemoved',
			count: 3
		});
	});
});
