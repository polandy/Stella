import { describe, expect, it } from 'bun:test';
import {
	decodeRelationshipChoice,
	encodeRelationshipChoice,
	endpointsForSide,
	relationshipTypeOptions
} from './type-options';

/*
 * Both directions of an asymmetric type are pickable (docs/02 §2.4): saying "Anna is a
 * child of Bert" must not mean opening Bert's profile to say he is her parent.
 */

const parentChild = { id: 'parent_child', symmetric: false };
const sibling = { id: 'sibling', symmetric: true };
const custom = { id: '01JA', symmetric: false };

describe('relationshipTypeOptions', () => {
	it('offers both sides of an asymmetric type, forward first', () => {
		expect(relationshipTypeOptions([parentChild])).toEqual([
			{ type: parentChild, side: 'forward', value: 'forward:parent_child' },
			{ type: parentChild, side: 'reverse', value: 'reverse:parent_child' }
		]);
	});

	it('offers a symmetric type once — its two labels read the same', () => {
		expect(relationshipTypeOptions([sibling])).toEqual([
			{ type: sibling, side: 'forward', value: 'forward:sibling' }
		]);
	});

	it('keeps the order the types arrive in', () => {
		expect(relationshipTypeOptions([parentChild, sibling, custom]).map((o) => o.value)).toEqual([
			'forward:parent_child',
			'reverse:parent_child',
			'forward:sibling',
			'forward:01JA',
			'reverse:01JA'
		]);
	});
});

describe('decodeRelationshipChoice', () => {
	it('reads back what was encoded', () => {
		expect(decodeRelationshipChoice(encodeRelationshipChoice('parent_child', 'reverse'))).toEqual({
			typeId: 'parent_child',
			side: 'reverse'
		});
	});

	it('keeps an id containing the separator whole', () => {
		expect(decodeRelationshipChoice('forward:a:b')).toEqual({ typeId: 'a:b', side: 'forward' });
	});

	it.each([
		['an unknown side', 'sideways:parent_child'],
		['no side at all', 'parent_child'],
		['an empty type id', 'forward:'],
		['nothing', '']
	])('refuses %s', (_case, value) => {
		expect(decodeRelationshipChoice(value)).toBeNull();
	});
});

describe('endpointsForSide', () => {
	it('stores the viewed person as the from-endpoint on the forward side', () => {
		expect(endpointsForSide('self', 'other', 'forward')).toEqual({
			fromContactId: 'self',
			toContactId: 'other'
		});
	});

	it('flips the endpoints on the reverse side, so the stored row still reads forward', () => {
		expect(endpointsForSide('self', 'other', 'reverse')).toEqual({
			fromContactId: 'other',
			toContactId: 'self'
		});
	});
});
