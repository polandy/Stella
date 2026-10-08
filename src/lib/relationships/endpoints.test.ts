import { describe, expect, it } from 'bun:test';
import { relationshipPair as brandedPair, type Endpoints } from './endpoints';

/** The pair as its plain fields, so it compares against a literal. */
const relationshipPair = (from: string, to: string, symmetric: boolean): Endpoints =>
	brandedPair(from, to, symmetric);

/* A relationship's two ends in the order they are stored (docs/03 §3.3 relationship). */

describe('relationshipPair', () => {
	it('keeps the given order for a one-way type: from is the forward-label side', () => {
		expect(relationshipPair('parent', 'child', false)).toEqual({
			fromContactId: 'parent',
			toContactId: 'child'
		});
		expect(relationshipPair('child', 'parent', false)).toEqual({
			fromContactId: 'child',
			toContactId: 'parent'
		});
	});

	it('stores a symmetric link the same way whichever end it was entered from', () => {
		const ab = relationshipPair('anna', 'ben', true);
		expect(relationshipPair('ben', 'anna', true)).toEqual(ab);
		expect(ab).toEqual({ fromContactId: 'anna', toContactId: 'ben' });
	});

	it('orders by code unit, as the unique index compares', () => {
		expect(relationshipPair('b', 'B', true)).toEqual({ fromContactId: 'B', toContactId: 'b' });
		expect(relationshipPair('monica:contact:10', 'monica:contact:9', true)).toEqual({
			fromContactId: 'monica:contact:10',
			toContactId: 'monica:contact:9'
		});
	});

	it('refuses a link from someone to themselves, either kind', () => {
		expect(() => relationshipPair('anna', 'anna', true)).toThrow();
		expect(() => relationshipPair('anna', 'anna', false)).toThrow();
	});
});
