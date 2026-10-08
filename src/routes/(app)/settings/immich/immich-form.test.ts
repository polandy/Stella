import { describe, expect, it } from 'bun:test';
import { MAX_PAIRS, newcomerOf, newcomerToAdd, pairsOf, rowOf } from './immich-form';

/*
 * What the forms of *Find your people* post (docs/02 §2.24.7), read before any use-case runs: a
 * post that is not from the page is refused whole, never guessed at.
 */

const formOf = (fields: [string, string | File][]) => {
	const form = new FormData();
	for (const [name, value] of fields) form.append(name, value);
	return form;
};
const file = new File([new Uint8Array([1])], 'x');

describe('pairsOf', () => {
	it('reads the confirmed pairs in step', () => {
		const form = formOf([
			['contactId', 'anna'],
			['immichPersonId', 'p1'],
			['contactId', 'ben'],
			['immichPersonId', 'p2']
		]);
		expect(pairsOf(form)).toEqual([
			{ contactId: 'anna', immichPersonId: 'p1' },
			{ contactId: 'ben', immichPersonId: 'p2' }
		]);
	});

	it('refuses a post with no pair, or with the pairing lost', () => {
		expect(pairsOf(formOf([]))).toBeNull();
		expect(pairsOf(formOf([['contactId', 'anna']]))).toBeNull();
	});

	it('refuses a field that is a file', () => {
		expect(
			pairsOf(
				formOf([
					['contactId', 'anna'],
					['immichPersonId', file]
				])
			)
		).toBeNull();
	});

	it('takes as many pairs as a list shows, and refuses one more', () => {
		const many = (count: number) =>
			formOf(
				Array.from({ length: count }, (_, at) => [
					['contactId', `c${at}`] as [string, string],
					['immichPersonId', `p${at}`] as [string, string]
				]).flat()
			);
		expect(pairsOf(many(MAX_PAIRS))).toHaveLength(MAX_PAIRS);
		expect(pairsOf(many(MAX_PAIRS + 1))).toBeNull();
	});
});

describe('rowOf', () => {
	it('reads a contact and every face its row showed', () => {
		const form = formOf([
			['contactId', 'anna'],
			['immichPersonId', 'p1'],
			['immichPersonId', 'p2']
		]);
		expect(rowOf(form)).toEqual({ contactId: 'anna', personIds: ['p1', 'p2'] });
	});

	it('refuses a row without a contact, or with a face that is a file', () => {
		expect(rowOf(formOf([['immichPersonId', 'p1']]))).toBeNull();
		expect(
			rowOf(
				formOf([
					['contactId', 'anna'],
					['immichPersonId', file]
				])
			)
		).toBeNull();
	});
});

describe('newcomerOf', () => {
	it('reads the face a newcomer form is about', () => {
		expect(newcomerOf(formOf([['immichPersonId', 'p1']]))).toBe('p1');
	});

	it('reads none from an empty, a missing or a file field', () => {
		expect(newcomerOf(formOf([['immichPersonId', '']]))).toBeNull();
		expect(newcomerOf(formOf([]))).toBeNull();
		expect(newcomerOf(formOf([['immichPersonId', file]]))).toBeNull();
	});
});

describe('newcomerToAdd', () => {
	it('reads the face and the name the member settled on, trimmed', () => {
		const form = formOf([
			['immichPersonId', 'p1'],
			['firstName', ' Anna '],
			['lastName', 'Lind'],
			['usePhoto', 'on']
		]);
		expect(newcomerToAdd(form)).toEqual({
			immichPersonId: 'p1',
			usePhoto: true,
			name: { firstName: 'Anna', lastName: 'Lind', nickname: '', description: '' }
		});
	});

	it('leaves the photo out unless the tick was posted', () => {
		expect(newcomerToAdd(formOf([['immichPersonId', 'p1']]))?.usePhoto).toBe(false);
		const blank = formOf([
			['immichPersonId', 'p1'],
			['usePhoto', '']
		]);
		expect(newcomerToAdd(blank)?.usePhoto).toBe(false);
	});

	it('refuses a form without a face', () => {
		expect(newcomerToAdd(formOf([['firstName', 'Anna']]))).toBeNull();
	});
});
