import { describe, expect, it } from 'bun:test';
import {
	circleRepositoryWith,
	inMemoryCircleDirectory,
	inMemoryCircleMemberships,
	membership,
	someCircle
} from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('someCircle', () => {
	it('is an overview row with every optional field empty and nobody in it', () => {
		expect(someCircle('choir', 'Choir')).toEqual({
			id: 'choir',
			householdId: 'h',
			createdBy: 'u',
			visibility: 'shared',
			name: 'Choir',
			description: null,
			kind: 'other',
			color: 'blue',
			startDate: null,
			endDate: null,
			memberCount: 0,
			preview: []
		});
	});

	it('takes the fields a test is about', () => {
		const club = someCircle('club', 'Club', { kind: 'club', memberCount: 3 });
		expect([club.kind, club.memberCount]).toEqual(['club', 3]);
	});
});

describe('inMemoryCircleDirectory', () => {
	it('lists the circles by name', async () => {
		const directory = inMemoryCircleDirectory([
			someCircle('club', 'Club'),
			someCircle('choir', 'Choir')
		]);
		expect((await directory.listVisibleTo(viewer)).map((c) => c.id)).toEqual(['choir', 'club']);
	});
});

describe('membership', () => {
	it('is one person in one circle, without a role, named by their ids', () => {
		expect(membership('choir', 'anna')).toEqual({
			membershipId: 'choir/anna',
			circleId: 'choir',
			circleName: 'choir',
			kind: 'other',
			color: 'blue',
			contactId: 'anna',
			displayName: 'anna',
			avatarPhotoId: null,
			role: null
		});
	});
});

describe('inMemoryCircleMemberships', () => {
	const memberships = inMemoryCircleMemberships([
		membership('choir', 'cleo', { circleName: 'Choir', displayName: 'Cleo', role: 'Alto' }),
		membership('choir', 'anna', { circleName: 'Choir', displayName: 'Anna' }),
		membership('club', 'anna', { circleName: 'Club', displayName: 'Anna', role: 'Captain' })
	]);

	it('lists a circle’s members by name, and no one of another circle', async () => {
		expect(await memberships.listMembersVisibleTo(viewer, 'choir')).toEqual([
			{
				membershipId: 'choir/anna',
				contactId: 'anna',
				displayName: 'Anna',
				avatarPhotoId: null,
				role: null
			},
			{
				membershipId: 'choir/cleo',
				contactId: 'cleo',
				displayName: 'Cleo',
				avatarPhotoId: null,
				role: 'Alto'
			}
		]);
	});

	it('lists a person’s circles by name', async () => {
		expect(await memberships.listForContactVisibleTo(viewer, 'anna')).toEqual([
			{
				membershipId: 'choir/anna',
				circleId: 'choir',
				name: 'Choir',
				kind: 'other',
				color: 'blue',
				role: null
			},
			{
				membershipId: 'club/anna',
				circleId: 'club',
				name: 'Club',
				kind: 'other',
				color: 'blue',
				role: 'Captain'
			}
		]);
	});

	it('reads every role with its circle’s name, by circle, no role first', async () => {
		expect(await memberships.listRoleUsesVisibleTo(viewer)).toEqual([
			{ circleName: 'Choir', role: null },
			{ circleName: 'Choir', role: 'Alto' },
			{ circleName: 'Club', role: 'Captain' }
		]);
	});
});

describe('circleRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const repo = circleRepositoryWith({ getVisibleTo: async () => null });
		expect(await repo.getVisibleTo(viewer, 'choir')).toBeNull();
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = circleRepositoryWith({});
		await expect(repo.removeMembership('choir', 'anna')).rejects.toThrow(
			'CircleRepository.removeMembership was not expected in this test'
		);
	});
});
