import { describe, expect, it } from 'bun:test';
import { factsOf, printOf, readCard } from './card-read';

/*
 * A card of the linked book as the sync reads it (docs/02 §2.16.3). The sync's own specs drive it
 * through whole books; these pin the edges: a card that does not read is left alone, and only the
 * facts of a person, not a card's bookkeeping, tell a rewrite apart.
 */

const vcard = (...lines: string[]) =>
	[
		'BEGIN:VCARD',
		'VERSION:4.0',
		'UID:anna',
		'FN:Anna Example',
		'N:Example;Anna;;;',
		...lines,
		'END:VCARD'
	].join('\r\n');

describe('readCard', () => {
	it('reads the one card a text holds', () => {
		expect(readCard(vcard('TEL:+41 79 000 00 01'))).toMatchObject({
			key: 'anna',
			firstName: 'Anna',
			lastName: 'Example'
		});
	});

	it('reads nothing from a text that is no vCard, so the sync leaves it alone', () => {
		expect(readCard('not a card')).toBeNull();
	});
});

describe('factsOf', () => {
	it('has no facts for a card that does not read', () => {
		expect(factsOf('not a card')).toBeNull();
	});

	it('sees no change when only a card’s note or revision differs', () => {
		expect(factsOf(vcard('NOTE:met at the Kita', 'REV:20261106T120000Z'))).toBe(factsOf(vcard()));
	});

	it('sees a change in a phone, a birthday or a name', () => {
		const before = factsOf(vcard('TEL:+41 79 000 00 01'));

		expect(factsOf(vcard('TEL:+41 79 000 00 02'))).not.toBe(before);
		expect(factsOf(vcard('TEL:+41 79 000 00 01', 'BDAY:1950-04-07'))).not.toBe(before);
		expect(factsOf(vcard('TEL:+41 79 000 00 01').replace('N:Example', 'N:Muster'))).not.toBe(
			before
		);
	});
});

describe('printOf', () => {
	it('has no print without a picture', () => {
		expect(printOf(null)).toBeNull();
	});
});
