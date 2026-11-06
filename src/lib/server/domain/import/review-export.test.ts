import { describe, expect, it } from 'bun:test';
import { readReviewExport } from './review-export';

/*
 * One vCard read both ways the matching review needs (docs/02 §2.16): the cards to compare and
 * the export the import maps. These pin that card i is contact i of the mapping, also when a
 * contact was saved twice.
 */

const card = (uid: string | null, name: string, ...lines: string[]) =>
	[
		'BEGIN:VCARD',
		'VERSION:4.0',
		...(uid ? [`UID:${uid}`] : []),
		`FN:${name}`,
		...lines,
		'END:VCARD'
	].join('\r\n');

describe('readReviewExport', () => {
	it('maps each card key to the plan’s id of its contact', () => {
		const read = readReviewExport([card('u1', 'Anna'), card('u2', 'Bert')].join('\r\n'));

		expect(read.cards.map((c) => c.key)).toEqual(['u1', 'u2']);
		expect([...read.planIdOf]).toEqual([
			['u1', 'vcard:contact:u1'],
			['u2', 'vcard:contact:u2']
		]);
		expect(read.exp.contacts).toHaveLength(2);
	});

	it('maps a contact saved twice to its own second person', () => {
		const anna = card('u1', 'Anna');
		const read = readReviewExport([anna, anna].join('\r\n'));

		expect([...read.planIdOf.values()]).toEqual(['vcard:contact:u1', 'vcard:contact:u1~2']);
		expect(read.planIdOf.size).toBe(2);
	});

	it('maps a card without a UID by its name and reach', () => {
		const read = readReviewExport(card(null, 'Anna', 'EMAIL:anna@example.org'));
		const [[key, planId]] = [...read.planIdOf];

		expect(key).toBe('name:anna|anna@example.org');
		expect(planId).toStartWith('vcard:contact:card-');
	});
});
