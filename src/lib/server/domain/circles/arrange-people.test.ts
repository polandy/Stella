import { describe, expect, it } from 'bun:test';
import { fixedClock, inMemoryCircleTree, sequentialIds, treeNode } from '../testing';
import {
	ArrangeNothingToDoError,
	ArrangeScopeError,
	ArrangeStaleError,
	arrangePeople,
	readArrangement,
	undoArrangement,
	type ArrangeMember,
	type ArrangementChange,
	type ArrangementPlan,
	type CircleArrangementRepository,
	type RevertPlan
} from './arrange-people';

/*
 * Arranging people between a circle and its sub-circles (docs/02 §2.4.2, ADR-127): who may take
 * part, which writes a pick turns into, and what is refused. The writes' transaction and the
 * exact restore are the adapter's, specified against SQLite in `db/circle-arrangement.test.ts`.
 */

const NOW = 1_700_000_000_000;
const viewer = { id: 'u1', householdId: 'h1' };

const member = (
	circleId: string,
	contactId: string,
	role: string | null = null,
	stay: { startDate?: string; endDate?: string; note?: string } = {}
): ArrangeMember => ({
	circleId,
	contactId,
	displayName: contactId,
	avatarPhotoId: null,
	role,
	startDate: stay.startDate ?? null,
	endDate: stay.endDate ?? null,
	note: stay.note ?? null
});

/**
 * School › Class 1b › Football, the viewer sees all three; `Hidden` is a circle they do not see
 * and `Other` stands on its own. Members are what the read model lists for the viewer.
 */
function household(members: ArrangeMember[], visibleContacts?: string[]) {
	const plans: ArrangementPlan[] = [];
	const reverts: RevertPlan[] = [];
	const circles: CircleArrangementRepository = {
		arrange: async (plan) => {
			plans.push(plan);
			return {
				added: plan.adds.map((a) => ({
					id: a.id,
					circleId: a.circleId,
					contactId: a.contactId,
					role: a.role,
					startDate: a.startDate,
					endDate: a.endDate,
					note: a.note,
					updatedAt: a.updatedAt
				})),
				removed: plan.removals.map((r) => ({
					id: `${r.circleId}/${r.contactId}`,
					circleId: r.circleId,
					contactId: r.contactId,
					role: null,
					startDate: null,
					endDate: null,
					note: null,
					createdBy: 'u1',
					createdAt: 1,
					updatedAt: 1
				}))
			};
		},
		revert: async (plan) => {
			reverts.push(plan);
			return { removed: plan.added.length, kept: 0, restored: plan.removed.length, conflicts: 0 };
		}
	};
	const deps = {
		tree: inMemoryCircleTree([
			treeNode('school', null, { name: 'School' }),
			treeNode('class', 'school', { name: 'Class 1b' }),
			treeNode('football', 'class', { name: 'Football' }),
			treeNode('other', null, { name: 'Other' })
		]),
		arrangement: {
			listMembersOfVisibleTo: async (_viewer: unknown, ids: readonly string[]) =>
				members.filter((m) => ids.includes(m.circleId)),
			visibleContactIdsAmong: async (_viewer: unknown, ids: readonly string[]) =>
				new Set(ids.filter((id) => visibleContacts?.includes(id) ?? true))
		},
		circles,
		ids: sequentialIds('m'),
		clock: fixedClock(NOW)
	};
	return { deps, plans, reverts };
}

const people = [
	member('school', 'keller'),
	member('class', 'lena', 'Pupil'),
	member('class', 'mia', 'Pupil'),
	member('football', 'lena', 'Captain'),
	member('other', 'ben')
];

const request = (
	mode: 'move' | 'copy',
	targetId: string,
	picks: [string, string][],
	scopeCircleId = 'school'
) => ({
	scopeCircleId,
	mode,
	targetId,
	picks: picks.map(([circleId, contactId]) => ({ circleId, contactId }))
});

describe('readArrangement', () => {
	it('lists the circle and every sub-circle below it with the path and the people directly in each', async () => {
		const { deps } = household(people);
		const zones = await readArrangement(deps, viewer, 'school');
		expect(zones?.map((z) => [z.circleId, z.path, z.members.map((m) => m.contactId)])).toEqual([
			['school', [], ['keller']],
			['class', ['Class 1b'], ['lena', 'mia']],
			['football', ['Class 1b', 'Football'], ['lena']]
		]);
	});

	it('starts the path at the circle the screen is opened on', async () => {
		const { deps } = household(people);
		const zones = await readArrangement(deps, viewer, 'class');
		expect(zones?.map((z) => [z.circleId, z.path])).toEqual([
			['class', []],
			['football', ['Football']]
		]);
	});

	it('is none for a circle the viewer does not see', async () => {
		const { deps } = household(people);
		expect(await readArrangement(deps, viewer, 'hidden')).toBeNull();
	});
});

describe('arrangePeople', () => {
	it('moves a person: a membership in the target with their role only, the old one deleted', async () => {
		const { deps, plans } = household(people);
		const result = await arrangePeople(
			deps,
			viewer,
			request('move', 'school', [['class', 'lena']])
		);

		expect(plans).toEqual([
			{
				adds: [
					{
						id: 'm',
						circleId: 'school',
						contactId: 'lena',
						role: 'Pupil',
						startDate: null,
						endDate: null,
						note: null,
						createdBy: 'u1',
						createdAt: NOW,
						updatedAt: NOW
					}
				],
				removals: [{ circleId: 'class', contactId: 'lena' }]
			}
		]);
		expect(result).toMatchObject({
			mode: 'move',
			targetId: 'school',
			targetName: 'School',
			addedCount: 1,
			alreadyThereCount: 0
		});
		expect(result.change.removed.map((r) => r.circleId)).toEqual(['class']);
	});

	it('carries the period and the note on a move, and only the role on a copy', async () => {
		const stay = { startDate: '2025-08', endDate: '2026-06', note: 'new in August' };
		const stayed = [member('class', 'mia', 'Pupil', stay)];
		const moved = household(stayed);
		await arrangePeople(moved.deps, viewer, request('move', 'school', [['class', 'mia']]));
		expect(moved.plans[0].adds[0]).toMatchObject({ role: 'Pupil', ...stay });

		const copied = household(stayed);
		await arrangePeople(copied.deps, viewer, request('copy', 'school', [['class', 'mia']]));
		expect(copied.plans[0].adds[0]).toMatchObject({
			role: 'Pupil',
			startDate: null,
			endDate: null,
			note: null
		});
	});

	it('takes everything from the first pick when a move names one person in two circles', async () => {
		const both = [
			member('class', 'lena', 'Pupil', { note: 'from the class' }),
			member('football', 'lena', 'Captain', { startDate: '2025-01', note: 'from football' })
		];
		const first = household(both);
		await arrangePeople(
			first.deps,
			viewer,
			request('move', 'school', [
				['football', 'lena'],
				['class', 'lena']
			])
		);
		expect(first.plans[0].adds).toHaveLength(1);
		expect(first.plans[0].adds[0]).toMatchObject({
			role: 'Captain',
			startDate: '2025-01',
			note: 'from football'
		});
	});

	it('copies a person and leaves the old membership alone', async () => {
		const { deps, plans } = household(people);
		const result = await arrangePeople(deps, viewer, request('copy', 'school', [['class', 'mia']]));
		expect(plans[0].removals).toEqual([]);
		expect(plans[0].adds.map((a) => [a.contactId, a.role])).toEqual([['mia', 'Pupil']]);
		expect(result.addedCount).toBe(1);
	});

	it('skips a person already in the target when copying and says how many were there', async () => {
		const { deps, plans } = household(people);
		const result = await arrangePeople(
			deps,
			viewer,
			request('copy', 'football', [
				['class', 'lena'],
				['class', 'mia']
			])
		);
		expect(plans[0].adds.map((a) => a.contactId)).toEqual(['mia']);
		expect(result).toMatchObject({ addedCount: 1, alreadyThereCount: 1 });
	});

	it('only takes a person already in the target out of the old place when moving', async () => {
		const { deps, plans } = household(people);
		const result = await arrangePeople(
			deps,
			viewer,
			request('move', 'football', [['class', 'lena']])
		);
		expect(plans[0]).toEqual({ adds: [], removals: [{ circleId: 'class', contactId: 'lena' }] });
		expect(result).toMatchObject({ addedCount: 0, alreadyThereCount: 1 });
	});

	it('gives a person picked in two circles one membership and takes both old ones away', async () => {
		const { deps, plans } = household(people);
		await arrangePeople(
			deps,
			viewer,
			request('move', 'school', [
				['class', 'lena'],
				['football', 'lena']
			])
		);
		expect(plans[0].adds.map((a) => [a.contactId, a.role])).toEqual([['lena', 'Pupil']]);
		expect(plans[0].removals).toEqual([
			{ circleId: 'class', contactId: 'lena' },
			{ circleId: 'football', contactId: 'lena' }
		]);
	});

	it('ignores a pick that is already in the target and does nothing when that was all', async () => {
		const { deps, plans } = household(people);
		await expect(
			arrangePeople(deps, viewer, request('move', 'class', [['class', 'lena']]))
		).rejects.toBeInstanceOf(ArrangeNothingToDoError);
		await expect(
			arrangePeople(deps, viewer, request('copy', 'football', [['class', 'lena']]))
		).rejects.toBeInstanceOf(ArrangeNothingToDoError);
		expect(plans).toEqual([]);
	});

	it.each([
		['a target outside the screen’s circles', 'other', [['class', 'lena']]],
		['a target the viewer cannot see', 'hidden', [['class', 'lena']]],
		['a pick from a circle outside the screen’s circles', 'school', [['other', 'ben']]],
		['a pick from a circle the viewer cannot see', 'school', [['hidden', 'ben']]]
	] as const)('refuses the whole batch for %s', async (_name, target, picks) => {
		const { deps, plans } = household([...people, member('hidden', 'ben')]);
		const attempt = arrangePeople(
			deps,
			viewer,
			request('move', target, [
				...picks.map(([c, p]) => [c, p] as [string, string]),
				['class', 'mia']
			])
		);
		await expect(attempt).rejects.toBeInstanceOf(ArrangeScopeError);
		expect(plans).toEqual([]);
	});

	it('refuses a screen opened on a circle the viewer does not see', async () => {
		const { deps, plans } = household(people);
		await expect(
			arrangePeople(deps, viewer, request('move', 'school', [['class', 'lena']], 'hidden'))
		).rejects.toBeInstanceOf(ArrangeScopeError);
		expect(plans).toEqual([]);
	});

	it('refuses a pick that is not in the circle any more rather than guessing', async () => {
		const { deps, plans } = household(people);
		await expect(
			arrangePeople(deps, viewer, request('move', 'school', [['class', 'ghost']]))
		).rejects.toBeInstanceOf(ArrangeStaleError);
		expect(plans).toEqual([]);
	});

	it('keeps scopes apart: a screen opened on a sub-circle cannot reach its parent', async () => {
		const { deps, plans } = household(people);
		await expect(
			arrangePeople(deps, viewer, request('move', 'school', [['class', 'lena']], 'class'))
		).rejects.toBeInstanceOf(ArrangeScopeError);
		expect(plans).toEqual([]);
	});
});

describe('undoArrangement', () => {
	const change: ArrangementChange = {
		added: [
			{
				id: 'a1',
				circleId: 'school',
				contactId: 'lena',
				role: 'Pupil',
				startDate: null,
				endDate: null,
				note: null,
				updatedAt: NOW
			}
		],
		removed: [
			{
				id: 'r1',
				circleId: 'class',
				contactId: 'lena',
				role: 'Pupil',
				startDate: '2025-08',
				endDate: null,
				note: 'new in August',
				createdBy: 'u2',
				createdAt: 5,
				updatedAt: 6
			}
		]
	};

	it('hands the receipt to the repository with the household it must belong to', async () => {
		const { deps, reverts } = household(people);
		const outcome = await undoArrangement(deps, viewer, 'school', change);
		expect(reverts).toEqual([{ ...change, householdId: 'h1', restoredBy: 'u1' }]);
		expect(outcome).toEqual({ removed: 1, kept: 0, restored: 1, conflicts: 0 });
	});

	it('refuses a receipt that names a circle the viewer does not see', async () => {
		const { deps, reverts } = household(people);
		const forged = { ...change, removed: [{ ...change.removed[0], circleId: 'hidden' }] };
		await expect(undoArrangement(deps, viewer, 'school', forged)).rejects.toBeInstanceOf(
			ArrangeScopeError
		);
		expect(reverts).toEqual([]);
	});

	it('refuses a receipt that reaches outside the screen’s circles', async () => {
		const { deps, reverts } = household(people);
		const forged = { ...change, added: [{ ...change.added[0], circleId: 'other' }] };
		await expect(undoArrangement(deps, viewer, 'school', forged)).rejects.toBeInstanceOf(
			ArrangeScopeError
		);
		expect(reverts).toEqual([]);
	});

	it('refuses a receipt that names a person the viewer does not see', async () => {
		const { deps, reverts } = household(people, ['mia']);
		await expect(undoArrangement(deps, viewer, 'school', change)).rejects.toBeInstanceOf(
			ArrangeScopeError
		);
		expect(reverts).toEqual([]);
	});

	it('refuses a screen opened on a circle the viewer does not see', async () => {
		const { deps, reverts } = household(people);
		await expect(undoArrangement(deps, viewer, 'hidden', change)).rejects.toBeInstanceOf(
			ArrangeScopeError
		);
		expect(reverts).toEqual([]);
	});
});
