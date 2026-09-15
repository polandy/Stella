import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	addMember,
	addMembers,
	CIRCLE_COLORS,
	createCircle,
	joinCircleByName,
	listRoleSuggestionsByCircleName,
	resolveCircleColor,
	resolveCircleKind,
	suggestCircleColor,
	suggestRoles,
	type Circle,
	type CircleDeps,
	type CircleRepository,
	type CircleRoleUse,
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
	let exists = false;
	let roleUses: CircleRoleUse[] = [];
	const repo: CircleRepository = {
		insert: async (c) => void inserted.push(c),
		findByNameVisibleTo: async () => existing,
		getVisibleTo: async () => null,
		listVisibleTo: async () => [],
		membershipExists: async () => exists,
		addMembership: async (m) => void memberships.push(m),
		removeMembership: async (cid, contactId) => void removed.push([cid, contactId]),
		listMembersVisibleTo: async () => [],
		listForContactVisibleTo: async () => [],
		listRoleUsesVisibleTo: async () => roleUses
	};
	return {
		repo,
		inserted,
		memberships,
		removed,
		setExists: (v: boolean) => (exists = v),
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
