import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	addMember,
	addMembers,
	CIRCLE_COLORS,
	createCircle,
	groupMembersByRole,
	joinCircleByName,
	listRoleSuggestionsByCircleName,
	resolveCircleColor,
	resolveCircleKind,
	setMembersRole,
	suggestCircleColor,
	suggestRoles,
	type Circle,
	type CircleDeps,
	type CircleRepository,
	type CircleRoleUse,
	type MemberView,
	type NewCircle,
	type NewMembership
} from './circles';

/*
 * Circle validation + use-cases (docs/02 §2.4.2). Pure/fake-driven: colour/kind normalisation,
 * find-or-create-then-join, and idempotent membership.
 */

describe('resolveCircleKind / resolveCircleColor', () => {
	it('defaults blanks and validates known values', () => {
		expect(resolveCircleKind(undefined)).toBe('other');
		expect(resolveCircleKind('club')).toBe('club');
		expect(resolveCircleColor('')).toBe('blue');
		expect(resolveCircleColor('mauve')).toBe('mauve');
	});
	it('rejects unknown values', () => {
		expect(() => resolveCircleKind('cabal')).toThrow();
		expect(() => resolveCircleColor('chartreuse')).toThrow();
	});
});

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const idGen = (values: string[]): IdGenerator => {
	let i = 0;
	return { next: () => values[i++] ?? `id-${i}` };
};
const creator = { userId: 'u1', householdId: 'h1', defaultVisibility: 'shared' as const };

function fakeRepo(existing: Circle | null = null) {
	const inserted: NewCircle[] = [];
	const memberships: NewMembership[] = [];
	const removed: Array<[string, string]> = [];
	const roleChanges: Array<{ circleId: string; contactIds: string[]; role: string | null; at: number }> = [];
	let exists = false;
	// Per-contact membership, for picks that mix people already in the circle with new ones.
	const existingMembers = new Set<string>();
	let roleUses: CircleRoleUse[] = [];
	const repo: CircleRepository = {
		insert: async (c) => void inserted.push(c),
		findByNameVisibleTo: async () => existing,
		getVisibleTo: async () => null,
		listVisibleTo: async () => [],
		addMemberships: async (batch) => {
			// Mirrors the adapter: skip whoever is already a member, insert the rest.
			const fresh = batch.filter((m) => !exists && !existingMembers.has(m.contactId));
			memberships.push(...fresh);
			fresh.forEach((m) => existingMembers.add(m.contactId));
		},
		removeMembership: async (cid, contactId) => void removed.push([cid, contactId]),
		setRoles: async (circleId, contactIds, role, at) =>
			void roleChanges.push({ circleId, contactIds: [...contactIds], role, at }),
		listMembersVisibleTo: async () => [],
		listForContactVisibleTo: async () => [],
		listRoleUsesVisibleTo: async () => roleUses
	};
	return {
		repo,
		inserted,
		memberships,
		removed,
		roleChanges,
		setExists: (v: boolean) => (exists = v),
		setExistingMembers: (ids: string[]) => ids.forEach((id) => existingMembers.add(id)),
		setRoleUses: (v: CircleRoleUse[]) => (roleUses = v)
	};
}

describe('createCircle', () => {
	it('creates a circle with normalised kind/colour and defaulted visibility', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['circle-1']), clock };
		const id = await createCircle(deps, creator, { name: '  Kegelclub  ', kind: 'club' });
		expect(id).toBe('circle-1');
		expect(f.inserted[0]).toMatchObject({
			id: 'circle-1',
			name: 'Kegelclub',
			kind: 'club',
			color: 'blue',
			visibility: 'shared',
			householdId: 'h1',
			createdBy: 'u1'
		});
	});

	it('rejects a blank name', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['x']), clock };
		await expect(createCircle(deps, creator, { name: '   ' })).rejects.toThrow();
	});
});

describe('joinCircleByName', () => {
	it('reuses an existing circle of that name', async () => {
		const existing: Circle = {
			id: 'circle-existing', householdId: 'h1', createdBy: 'u1', visibility: 'shared',
			name: 'Kegelclub', description: null, kind: 'club', color: 'blue', startDate: null, endDate: null
		};
		const f = fakeRepo(existing);
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['membership-1']), clock };
		const id = await joinCircleByName(deps, creator, 'mara', 'Kegelclub', 'member');
		expect(id).toBe('circle-existing');
		expect(f.inserted).toHaveLength(0); // not re-created
		expect(f.memberships[0]).toMatchObject({ circleId: 'circle-existing', contactId: 'mara', role: 'member' });
	});

	it('creates the circle when none exists', async () => {
		const f = fakeRepo(null);
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['circle-1', 'membership-1']), clock };
		const id = await joinCircleByName(deps, creator, 'mara', 'Ski Course');
		expect(id).toBe('circle-1');
		expect(f.inserted[0]).toMatchObject({ name: 'Ski Course' });
		expect(f.memberships[0]).toMatchObject({ circleId: 'circle-1', contactId: 'mara' });
	});
});

describe('suggestCircleColor', () => {
	it('never suggests an already-used colour while any remain', () => {
		const used = CIRCLE_COLORS.slice(0, CIRCLE_COLORS.length - 1); // all but the last
		expect(suggestCircleColor(used, () => 0)).toBe(CIRCLE_COLORS[CIRCLE_COLORS.length - 1]);
	});

	it('picks from the free colours deterministically with an injected rng', () => {
		// none used → first colour when rng returns 0
		expect(suggestCircleColor([], () => 0)).toBe(CIRCLE_COLORS[0]);
	});

	it('falls back to any colour when all are used', () => {
		const c = suggestCircleColor(CIRCLE_COLORS, () => 0);
		expect(CIRCLE_COLORS).toContain(c);
	});
});

describe('addMember', () => {
	it('is idempotent when the membership already exists', async () => {
		const f = fakeRepo();
		f.setExists(true);
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['m1']), clock };
		await addMember(deps, creator, 'circle-1', 'mara');
		expect(f.memberships).toHaveLength(0);
	});
});

describe('addMembers', () => {
	it('adds every chosen contact, with the one role on each of them', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['m1', 'm2', 'm3']), clock };
		await addMembers(deps, creator, 'circle-1', ['mara', 'jonas', 'ida'], ' coach ');
		expect(f.memberships.map((m) => m.contactId)).toEqual(['mara', 'jonas', 'ida']);
		expect(f.memberships.every((m) => m.role === 'coach')).toBe(true);
		expect(f.memberships.every((m) => m.circleId === 'circle-1')).toBe(true);
	});

	it('adds a contact named twice only once', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['m1']), clock };
		await addMembers(deps, creator, 'circle-1', ['mara', 'mara']);
		expect(f.memberships).toHaveLength(1);
	});

	it('skips those already in the circle', async () => {
		const f = fakeRepo();
		f.setExists(true);
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['m1']), clock };
		await addMembers(deps, creator, 'circle-1', ['mara', 'jonas']);
		expect(f.memberships).toHaveLength(0);
	});

	it('adds only the new people in a mixed pick, leaving an existing member’s role alone', async () => {
		const f = fakeRepo();
		f.setExistingMembers(['mara']);
		const deps: CircleDeps = { circles: f.repo, ids: idGen(['m1']), clock };
		await addMembers(deps, creator, 'circle-1', ['mara', 'jonas'], 'coach');
		// The positive control for the skip: jonas proves the call did run and did write.
		expect(f.memberships.map((m) => m.contactId)).toEqual(['jonas']);
		expect(f.memberships[0].role).toBe('coach');
	});
});

describe('setMembersRole', () => {
	it('gives every chosen member the one trimmed role, in a single write', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen([]), clock };
		await setMembersRole(deps, 'circle-1', ['mara', 'jonas', 'ida'], ' coach ');
		expect(f.roleChanges).toEqual([
			{ circleId: 'circle-1', contactIds: ['mara', 'jonas', 'ida'], role: 'coach', at: NOW }
		]);
	});

	it('takes the role away when it is blank', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen([]), clock };
		await setMembersRole(deps, 'circle-1', ['mara'], '   ');
		expect(f.roleChanges[0].role).toBeNull();
	});

	it('names each member once, even when the pick names one twice', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen([]), clock };
		await setMembersRole(deps, 'circle-1', ['mara', 'mara', 'jonas'], 'coach');
		expect(f.roleChanges[0].contactIds).toEqual(['mara', 'jonas']);
	});

	it('writes nothing for an empty pick', async () => {
		const f = fakeRepo();
		const deps: CircleDeps = { circles: f.repo, ids: idGen([]), clock };
		await setMembersRole(deps, 'circle-1', [], 'coach');
		expect(f.roleChanges).toHaveLength(0);
	});
});

describe('suggestRoles', () => {
	it('ranks the roles already used in the circle by how common they are', () => {
		expect(suggestRoles(['student', 'teacher', 'student', 'student', 'teacher', 'coach'])).toEqual([
			'student',
			'teacher',
			'coach'
		]);
	});

	it('breaks ties alphabetically so the order is stable', () => {
		expect(suggestRoles(['captain', 'member', 'assistant'])).toEqual([
			'assistant',
			'captain',
			'member'
		]);
	});

	it('ignores members without a role and trims what is left', () => {
		expect(suggestRoles([null, '  member  ', '   ', 'member'])).toEqual(['member']);
	});

	it('folds spellings that differ only in case, keeping the most common one', () => {
		expect(suggestRoles(['Teacher', 'teacher', 'teacher'])).toEqual(['teacher']);
		expect(suggestRoles(['Teacher', 'Teacher', 'teacher'])).toEqual(['Teacher']);
	});
});

describe('groupMembersByRole', () => {
	const member = (name: string, role: string | null): MemberView => ({
		membershipId: `m-${name}`,
		contactId: `c-${name}`,
		displayName: name,
		avatarPhotoId: null,
		role
	});
	const shape = (members: MemberView[]) =>
		groupMembersByRole(members).map((g) => [g.role, g.members.map((m) => m.displayName)]);

	it('groups people under their role, the most common role first', () => {
		expect(
			shape([
				member('anna', 'teacher'),
				member('bert', 'student'),
				member('carl', 'student'),
				member('dora', 'coach')
			])
		).toEqual([
			['student', ['bert', 'carl']],
			['coach', ['dora']],
			['teacher', ['anna']]
		]);
	});

	it('keeps the given order of people inside a group', () => {
		expect(shape([member('dora', 'student'), member('anna', 'student')])).toEqual([
			['student', ['dora', 'anna']]
		]);
	});

	it('puts the people without a role last, under no role', () => {
		expect(
			shape([member('anna', null), member('bert', '   '), member('carl', 'coach')])
		).toEqual([
			['coach', ['carl']],
			[null, ['anna', 'bert']]
		]);
	});

	it('folds spellings that differ only in case under the most common one', () => {
		expect(
			shape([member('anna', 'Teacher'), member('bert', 'teacher'), member('carl', ' teacher ')])
		).toEqual([['teacher', ['anna', 'bert', 'carl']]]);
	});

	it('has no groups for an empty circle', () => {
		expect(groupMembersByRole([])).toEqual([]);
	});
});

describe('listRoleSuggestionsByCircleName', () => {
	it('groups the roles per circle, keyed by the circle name as typed', async () => {
		const f = fakeRepo();
		f.setRoleUses([
			{ circleName: 'Ski Course', role: 'coach' },
			{ circleName: 'Ski Course', role: 'pupil' },
			{ circleName: 'Ski Course', role: 'pupil' },
			{ circleName: 'Day School', role: 'teacher' },
			{ circleName: 'Day School', role: null }
		]);
		const deps: CircleDeps = { circles: f.repo, ids: idGen([]), clock };
		const byName = await listRoleSuggestionsByCircleName(deps, { id: 'u1', householdId: 'h1' });
		expect(byName).toEqual({ 'ski course': ['pupil', 'coach'], 'day school': ['teacher'] });
	});

	it('is keyed case-insensitively so a differently typed name still matches', async () => {
		const f = fakeRepo();
		f.setRoleUses([
			{ circleName: 'Ski Course', role: 'coach' },
			{ circleName: 'ski course', role: 'coach' }
		]);
		const deps: CircleDeps = { circles: f.repo, ids: idGen([]), clock };
		expect(await listRoleSuggestionsByCircleName(deps, { id: 'u1', householdId: 'h1' })).toEqual({
			'ski course': ['coach']
		});
	});
});
