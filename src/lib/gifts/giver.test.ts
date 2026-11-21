import { describe, expect, it } from 'bun:test';
import { giverViewOf, isAssigned } from './giver';

/* Who gives a gift, as a row shows it (docs/dev/02 §2.25.12). */

const none = {
	giverContactId: null,
	giverIsHousehold: false,
	giverLeftName: null,
	giverName: null
};

describe('giverViewOf', () => {
	it('names a giver the viewer sees', () => {
		expect(giverViewOf({ ...none, giverContactId: 'sandra', giverName: 'Sandra' })).toEqual({
			kind: 'person',
			contactId: 'sandra',
			name: 'Sandra'
		});
	});

	it('hides who an unseen giver is, id included', () => {
		expect(giverViewOf({ ...none, giverContactId: 'secret' })).toEqual({ kind: 'unseen' });
	});

	it('reads the household, a deleted giver’s name, or nobody', () => {
		expect(giverViewOf({ ...none, giverIsHousehold: true })).toEqual({ kind: 'household' });
		expect(giverViewOf({ ...none, giverLeftName: 'Ruth' })).toEqual({ kind: 'left', name: 'Ruth' });
		expect(giverViewOf(none)).toEqual({ kind: 'none' });
	});

	it('counts any giver but nobody as taken', () => {
		expect(isAssigned({ kind: 'unseen' })).toBe(true);
		expect(isAssigned({ kind: 'none' })).toBe(false);
	});
});
