import { describe, expect, it } from 'bun:test';
import {
	decodeRelationshipChoice,
	encodeRelationshipChoice,
	isChoiceOfLink,
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

/*
 * What the edit form preselects (docs/02 §2.4). A select with no matching option falls back
 * to its first entry, so a link that points at no entry would be retyped by a save that only
 * meant to correct the specifics — the symmetric case below is exactly that trap.
 */
describe('isChoiceOfLink', () => {
	const optionsOf = (type: { id: string; symmetric: boolean }) => relationshipTypeOptions([type]);

	it('matches the side an asymmetric link reads as, and only that side', () => {
		const [forward, reverse] = optionsOf(parentChild);
		const link = { typeId: 'parent_child', side: 'reverse' as const };

		expect(isChoiceOfLink(reverse, link)).toBe(true);
		expect(isChoiceOfLink(forward, link)).toBe(false);
	});

	it('matches a symmetric type read from either endpoint, since it is offered once', () => {
		const [only] = optionsOf(sibling);
		expect(only.side).toBe('forward');

		expect(isChoiceOfLink(only, { typeId: 'sibling', side: 'forward' })).toBe(true);
		// The endpoint the link is stored second reads it as `reverse`; the picker has no
		// such entry, and preselecting nothing there is what would retype the link.
		expect(isChoiceOfLink(only, { typeId: 'sibling', side: 'reverse' })).toBe(true);
	});

	it('never matches an entry of another type', () => {
		const [forward] = optionsOf(parentChild);
		expect(isChoiceOfLink(forward, { typeId: 'sibling', side: 'forward' })).toBe(false);
	});

	it('preselects exactly one entry for every link a row can show', () => {
		const options = relationshipTypeOptions([parentChild, sibling]);

		for (const link of [
			{ typeId: 'parent_child', side: 'forward' as const },
			{ typeId: 'parent_child', side: 'reverse' as const },
			{ typeId: 'sibling', side: 'forward' as const },
			{ typeId: 'sibling', side: 'reverse' as const }
		]) {
			expect(options.filter((option) => isChoiceOfLink(option, link))).toHaveLength(1);
		}
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
