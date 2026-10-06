import { describe, expect, it } from 'bun:test';
import { parseProposePairs, proposeHref } from './propose';

/*
 * After a new link, the person page comes back naming the pair so its implied links can be
 * offered (docs/02 §2.4.1). Written by the form's action and by the page saving through the
 * outbox alike, read by the page's load. A batch names every pair it stored, so *Also true?*
 * is worked out for all of them at once (docs/concepts/multi-pick-relationships.html D7).
 */

const proposeOf = (href: string) => new URL(href, 'http://x').searchParams.get('propose');

describe('the propose pairs', () => {
	it('comes back to the relationships card naming the new pair', () => {
		expect(proposeHref('anna', ['bert'])).toBe('/contacts/anna?propose=anna:bert#relationships');
	});

	it('reads back the pair it wrote', () => {
		expect(parseProposePairs(proposeOf(proposeHref('anna', ['bert'])))).toEqual([
			{ a: 'anna', b: 'bert' }
		]);
	});

	it('names every pair of a batch, and reads them back in order', () => {
		const href = proposeHref('lio', ['anna', 'bert']);
		expect(href).toBe('/contacts/lio?propose=lio:anna,lio:bert#relationships');
		expect(parseProposePairs(proposeOf(href))).toEqual([
			{ a: 'lio', b: 'anna' },
			{ a: 'lio', b: 'bert' }
		]);
	});

	it('reads nothing from a missing or half pair, and keeps the whole ones beside it', () => {
		expect(parseProposePairs(null)).toEqual([]);
		expect(parseProposePairs('anna')).toEqual([]);
		expect(parseProposePairs(':bert')).toEqual([]);
		expect(parseProposePairs('anna:,anna:bert')).toEqual([{ a: 'anna', b: 'bert' }]);
	});
});
