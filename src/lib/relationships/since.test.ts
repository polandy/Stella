import { describe, expect, it } from 'bun:test';
import { PARENT_CHILD_TYPE_KEY, SIBLING_TYPE_KEY } from './type-keys';
import { sinceDateFromBirth } from './since';

const child = { birthDate: '2015-05-20' };
const parent = { birthDate: '1980-03-02' };

describe('sinceDateFromBirth', () => {
	it('dates a "parent of" link from the other person, who is the child', () => {
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'forward' }, parent, child)
		).toBe('2015-05-20');
	});

	it('dates a "child of" link from the viewed person, who is the child', () => {
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'reverse' }, child, parent)
		).toBe('2015-05-20');
	});

	it('suggests nothing for a type that does not begin at a birth', () => {
		expect(
			sinceDateFromBirth({ typeKey: SIBLING_TYPE_KEY, side: 'forward' }, parent, child)
		).toBe('');
	});

	it('suggests nothing while nobody is picked yet', () => {
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'forward' }, parent, null)
		).toBe('');
	});

	it('suggests nothing when the child has no birth date', () => {
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'forward' }, parent, {
				birthDate: null
			})
		).toBe('');
	});

	it('suggests nothing from a birth date that names no whole day', () => {
		// A day-and-month birthday (docs/03 §3.4) says nothing about *when* the link began,
		// and an estimated year is not a day at all.
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'forward' }, parent, {
				birthDate: '--05-20'
			})
		).toBe('');
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'forward' }, parent, {
				birthDate: '2015'
			})
		).toBe('');
	});

	it('suggests nothing from a birth date that never happened', () => {
		expect(
			sinceDateFromBirth({ typeKey: PARENT_CHILD_TYPE_KEY, side: 'forward' }, parent, {
				birthDate: '2015-02-30'
			})
		).toBe('');
	});
});
