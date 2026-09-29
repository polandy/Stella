import { describe, expect, it } from 'bun:test';
import { parseProposePair, proposeHref } from './propose';

/*
 * After a new link, the person page comes back naming the pair so its implied links can be
 * offered (docs/02 §2.4.1). Written by the form's action and by the page saving through the
 * outbox alike, read by the page's load.
 */

describe('the propose pair', () => {
	it('comes back to the relationships card naming the new pair', () => {
		expect(proposeHref('anna', 'bert')).toBe('/contacts/anna?propose=anna:bert#relationships');
	});

	it('reads back the pair it wrote', () => {
		const query = new URL(proposeHref('anna', 'bert'), 'http://x').searchParams.get('propose');
		expect(parseProposePair(query)).toEqual({ a: 'anna', b: 'bert' });
	});

	it('reads nothing from a missing or half pair', () => {
		expect(parseProposePair(null)).toBeNull();
		expect(parseProposePair('anna')).toBeNull();
		expect(parseProposePair(':bert')).toBeNull();
	});
});
