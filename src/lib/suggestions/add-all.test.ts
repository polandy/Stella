import { describe, expect, it } from 'bun:test';
import { addAllBatches } from './add-all';

/*
 * *Add all* on the *Also true?* block (docs/concepts/multi-pick-relationships.html D7): the
 * claims that can be stored as one batch — one person, one type, several people at the other
 * end — so a household that has read them all can take them in one step and one *Undo*.
 */

const parent = (fromId: string, toId: string) => ({ relation: 'parent' as const, fromId, toId });
const noParents = () => 0;

describe('addAllBatches', () => {
	it('gathers a child’s offered parents into one "child of" batch', () => {
		expect(addAllBatches([parent('anna', 'mia'), parent('bert', 'mia')], noParents)).toEqual([
			{ subjectId: 'mia', side: 'reverse', targetIds: ['anna', 'bert'] }
		]);
	});

	it('gathers one parent offered for several children into one "parent of" batch', () => {
		expect(addAllBatches([parent('bert', 'lio'), parent('bert', 'mia'), parent('bert', 'tom')], noParents)).toEqual([
			{ subjectId: 'bert', side: 'forward', targetIds: ['lio', 'mia', 'tom'] }
		]);
	});

	it('offers nothing for a claim that stands alone: its own Accept is the one step', () => {
		expect(addAllBatches([parent('anna', 'mia'), parent('bert', 'lio')], noParents)).toEqual([]);
	});

	it('groups by child first, and gives every claim to one batch at most', () => {
		const claims = [parent('anna', 'mia'), parent('bert', 'mia'), parent('anna', 'tom'), parent('bert', 'tom')];
		expect(addAllBatches(claims, noParents)).toEqual([
			{ subjectId: 'mia', side: 'reverse', targetIds: ['anna', 'bert'] },
			{ subjectId: 'tom', side: 'reverse', targetIds: ['anna', 'bert'] }
		]);
	});

	// All or nothing on the server: a batch the parent cap would refuse is not offered at all.
	it('offers no batch that would give a child more than two parents', () => {
		const onRecord = (childId: string) => (childId === 'mia' ? 1 : 0);
		expect(addAllBatches([parent('anna', 'mia'), parent('bert', 'mia')], onRecord)).toEqual([]);
	});

	it('leaves claims that are not parent claims to their own rows', () => {
		const sibling = { relation: 'sibling' as const, fromId: 'lio', toId: 'mia' };
		const cousin = { relation: 'cousin' as const, fromId: 'lio', toId: 'tom' };
		expect(addAllBatches([sibling, cousin, { ...sibling, toId: 'tom' }], noParents)).toEqual([]);
	});
});
