import { describe, expect, it } from 'bun:test';
import { inMemoryCircleMemberships, membership } from '../testing';
import { listCirclesForContact, listMembers, listRoleSuggestionsByCircleName } from './memberships';

/*
 * Who is in which circle, as the circle page and a person's page list it (docs/02 §2.4.2) —
 * over the in-memory membership read model.
 */

const viewer = { id: 'u1', householdId: 'h1' };

describe('listMembers / listCirclesForContact', () => {
	const deps = {
		memberships: inMemoryCircleMemberships([
			membership('choir', 'mara', { circleName: 'Choir', role: 'Alto' }),
			membership('club', 'mara', { circleName: 'Club' }),
			membership('choir', 'jonas', { circleName: 'Choir' })
		])
	};

	it('lists one circle’s members', async () => {
		expect((await listMembers(deps, viewer, 'choir')).map((m) => m.contactId)).toEqual([
			'jonas',
			'mara'
		]);
	});

	it('lists the circles one person is in', async () => {
		expect((await listCirclesForContact(deps, viewer, 'mara')).map((c) => c.name)).toEqual([
			'Choir',
			'Club'
		]);
	});
});

describe('listRoleSuggestionsByCircleName', () => {
	const uses = (...rows: [circleName: string, role: string | null][]) => ({
		memberships: inMemoryCircleMemberships(
			rows.map(([circleName, role], i) => membership(circleName, `c${i}`, { circleName, role }))
		)
	});

	it('groups the roles per circle, keyed by the circle name as typed', async () => {
		const deps = uses(
			['Ski Course', 'coach'],
			['Ski Course', 'pupil'],
			['Ski Course', 'pupil'],
			['Day School', 'teacher'],
			['Day School', null]
		);
		expect(await listRoleSuggestionsByCircleName(deps, viewer)).toEqual({
			'ski course': ['pupil', 'coach'],
			'day school': ['teacher']
		});
	});

	it('is keyed case-insensitively so a differently typed name still matches', async () => {
		const deps = uses(['Ski Course', 'coach'], ['ski course', 'coach']);
		expect(await listRoleSuggestionsByCircleName(deps, viewer)).toEqual({
			'ski course': ['coach']
		});
	});
});
