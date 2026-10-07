import { describe, expect, it } from 'bun:test';
import { cutCandidates, type CandidatePerson } from './cut-candidates';

/*
 * Whom a group photo's profile picture is cut for (docs/02 §2.4.2): the
 * circle's members first, those in the photo's role ahead of the rest, and a search over
 * everyone the viewer can see. People already wearing a cut of this photo are marked.
 */

const person = (id: string, displayName = id): CandidatePerson => ({
	id,
	displayName,
	firstName: displayName.split(' ')[0] ?? null,
	lastName: displayName.split(' ')[1] ?? null,
	nickname: null,
	description: null,
	avatarPhotoId: null
});

const people = [
	person('anna', 'Anna Keller'),
	person('ben', 'Ben Roth'),
	person('cleo', 'Cleo Keller'),
	person('dora', 'Dora Frei'),
	person('emil', 'Emil Brunner')
];
const members = [
	{ contactId: 'anna', role: 'Student' },
	{ contactId: 'ben', role: 'Teacher' },
	{ contactId: 'cleo', role: 'student ' }
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('before anything is typed', () => {
	it('lists the members in the photo’s role first, then the other members, and nobody else', () => {
		const groups = cutCandidates({ members, people, photoRole: 'Student', wearing: [], query: '' });
		expect(ids(groups.inRole)).toEqual(['anna', 'cleo']);
		expect(ids(groups.inCircle)).toEqual(['ben']);
		expect(groups.others).toEqual([]);
	});

	it('lists all members together for a photo of the circle as a whole', () => {
		const groups = cutCandidates({ members, people, photoRole: null, wearing: [], query: '' });
		expect(groups.inRole).toEqual([]);
		expect(ids(groups.inCircle)).toEqual(['anna', 'ben', 'cleo']);
	});

	it('marks the people who already wear a cut of this photo', () => {
		const groups = cutCandidates({
			members,
			people,
			photoRole: 'Student',
			wearing: ['cleo'],
			query: ''
		});
		expect(groups.inRole.map((p) => [p.id, p.wearsCut])).toEqual([
			['anna', false],
			['cleo', true]
		]);
	});
});

describe('searching', () => {
	it('narrows the members and finds anyone else the viewer can see', () => {
		const groups = cutCandidates({
			members,
			people,
			photoRole: 'Student',
			wearing: [],
			query: 'keller'
		});
		expect(ids(groups.inRole)).toEqual(['anna', 'cleo']);
		expect(groups.inCircle).toEqual([]);
		expect(groups.others).toEqual([]);

		const emil = cutCandidates({
			members,
			people,
			photoRole: 'Student',
			wearing: [],
			query: 'emil'
		});
		expect(ids(emil.others)).toEqual(['emil']);
		expect([...emil.inRole, ...emil.inCircle]).toEqual([]);
	});

	it('never lists a member twice', () => {
		const groups = cutCandidates({ members, people, photoRole: null, wearing: [], query: 'b' });
		expect(ids(groups.others)).not.toContain('ben');
		expect(ids(groups.inCircle)).toContain('ben');
	});

	it('leaves out a member the viewer cannot see', () => {
		const groups = cutCandidates({
			members: [...members, { contactId: 'ghost', role: 'Student' }],
			people,
			photoRole: 'Student',
			wearing: [],
			query: ''
		});
		expect(ids(groups.inRole)).toEqual(['anna', 'cleo']);
	});
});
