import { describe, expect, it } from 'bun:test';
import { sinceDateFromBirth, type KinChoice } from './since';

const child = { birthDate: '2015-05-20' };
const parent = { birthDate: '1980-03-02' };
const olderSibling = { birthDate: '2011-09-08' };

const parentOf: KinChoice = { category: 'family', symmetric: false, side: 'forward' };
const childOf: KinChoice = { category: 'family', symmetric: false, side: 'reverse' };
const siblingOf: KinChoice = { category: 'family', symmetric: true, side: 'forward' };

describe('sinceDateFromBirth', () => {
	it('dates a "parent of" link from the other person, who is the younger one', () => {
		expect(sinceDateFromBirth(parentOf, parent, child)).toBe('2015-05-20');
	});

	it('dates a "child of" link from the viewed person, who is the younger one', () => {
		expect(sinceDateFromBirth(childOf, child, parent)).toBe('2015-05-20');
	});

	it('dates a directed link from the younger one alone, whose birthday may be the only one on file', () => {
		// "Godparent of" is a household's own type (docs/02 §2.4): the forward side names the
		// elder role, so the godparent's own birthday need not be known.
		expect(sinceDateFromBirth(parentOf, { birthDate: null }, child)).toBe('2015-05-20');
	});

	it('dates a symmetric link from the later of the two births', () => {
		expect(sinceDateFromBirth(siblingOf, olderSibling, child)).toBe('2015-05-20');
		expect(sinceDateFromBirth(siblingOf, child, olderSibling)).toBe('2015-05-20');
	});

	it('suggests nothing for a symmetric link while only one birthday is known', () => {
		// Which of the two came later is exactly the question, and one date does not answer it.
		expect(sinceDateFromBirth(siblingOf, { birthDate: null }, child)).toBe('');
	});

	it('suggests nothing outside the family, where a link begins at a meeting', () => {
		expect(
			sinceDateFromBirth({ category: 'romantic', symmetric: true, side: 'forward' }, parent, child)
		).toBe('');
		expect(
			sinceDateFromBirth({ category: 'social', symmetric: false, side: 'forward' }, parent, child)
		).toBe('');
	});

	it('suggests nothing while nobody is picked yet', () => {
		expect(sinceDateFromBirth(parentOf, parent, null)).toBe('');
	});

	it('suggests nothing when the younger one has no birth date', () => {
		expect(sinceDateFromBirth(parentOf, parent, { birthDate: null })).toBe('');
	});

	it('suggests nothing from a birth date that names no whole day', () => {
		// A day-and-month birthday (docs/03 §3.4) says nothing about *when* the link began,
		// and an estimated year is not a day at all.
		expect(sinceDateFromBirth(parentOf, parent, { birthDate: '--05-20' })).toBe('');
		expect(sinceDateFromBirth(parentOf, parent, { birthDate: '2015' })).toBe('');
		expect(sinceDateFromBirth(siblingOf, { birthDate: '--09-08' }, child)).toBe('');
	});

	it('suggests nothing from a birth date that never happened', () => {
		expect(sinceDateFromBirth(parentOf, parent, { birthDate: '2015-02-30' })).toBe('');
	});
});
