import { describe, expect, it } from 'bun:test';
import { TranslatableError } from '../../../i18n/translatable';
import { fixedClock, inMemoryCircleMemberships, membership, type FakeMembership } from '../testing';
import type { CirclePhoto } from './circle-photos';
import type { RoleRename } from './circles';
import { BlankRoleNameError, renameCircleRole, type RenameRoleDeps } from './rename-role';

/*
 * Renaming one role of a circle (docs/02 §2.4.2): every visible member and every visible photo of
 * this circle that carries the role — folded by case — gets the new name, in one write.
 */

const NOW = 1_700_000_000_000;
const clock = fixedClock(NOW);
const viewer = { id: 'u1', householdId: 'h1' };

const member = (contactId: string, role: string | null) => membership('class', contactId, { role });

const photo = (id: string, role: string | null): CirclePhoto => ({
	takenAt: null,
	id,
	circleId: 'class',
	role,
	caption: null,
	visibility: 'shared',
	createdBy: 'u1',
	createdByName: 'One',
	width: 10,
	height: 10,
	createdAt: 1,
	pinnedAt: null
});

function fakes(members: FakeMembership[], photos: CirclePhoto[] = []) {
	const renames: RoleRename[] = [];
	const deps: RenameRoleDeps = {
		circles: { renameRole: async (change) => void renames.push(change) },
		memberships: inMemoryCircleMemberships(members),
		circlePhotos: { listVisible: async () => photos },
		clock
	};
	return { deps, renames };
}

describe('renameCircleRole', () => {
	it('gives every member and photo of the role the new, trimmed name in one write', async () => {
		const f = fakes(
			[
				member('mara', 'Teacher'),
				member('jonas', 'teacher '),
				member('ida', 'Pupil'),
				member('eli', null)
			],
			[photo('p1', 'TEACHER'), photo('p2', 'Pupil'), photo('p3', null)]
		);
		await renameCircleRole(f.deps, viewer, {
			circleId: 'class',
			from: 'Teacher',
			to: '  Class teacher '
		});
		expect(f.renames).toEqual([
			{
				circleId: 'class',
				contactIds: ['jonas', 'mara'],
				photoIds: ['p1'],
				role: 'Class teacher',
				updatedAt: NOW
			}
		]);
	});

	it('fixes the spelling when only the case changes', async () => {
		const f = fakes([member('mara', 'teacher'), member('jonas', 'Teacher')]);
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: 'Teacher', to: 'TEACHER' });
		expect(f.renames[0]).toMatchObject({ contactIds: ['jonas', 'mara'], role: 'TEACHER' });
	});

	it('merges into a role that already exists, which then reads exactly as typed', async () => {
		const f = fakes(
			[member('mara', 'Trainer'), member('jonas', 'Coach'), member('ida', 'Pupil')],
			[photo('p1', 'trainer'), photo('p2', 'COACH')]
		);
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: 'Trainer', to: 'coach' });
		expect(f.renames[0]).toMatchObject({
			contactIds: ['jonas', 'mara'],
			photoIds: ['p1', 'p2'],
			role: 'coach'
		});
	});

	it('rejects a blank new name with a phrase, writing nothing', async () => {
		const f = fakes([member('mara', 'Teacher')]);
		const attempt = renameCircleRole(f.deps, viewer, {
			circleId: 'class',
			from: 'Teacher',
			to: '   '
		});
		await expect(attempt).rejects.toBeInstanceOf(BlankRoleNameError);
		await expect(attempt).rejects.toBeInstanceOf(TranslatableError);
		expect(f.renames).toHaveLength(0);
	});

	it('never renames the people without a role', async () => {
		const f = fakes([member('mara', null), member('jonas', 'Teacher')], [photo('p1', null)]);
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: '  ', to: 'Coach' });
		expect(f.renames).toHaveLength(0);
		// Positive control: the same fakes do write for a real role.
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: 'Teacher', to: 'Coach' });
		expect(f.renames[0]).toMatchObject({ contactIds: ['jonas'], photoIds: [] });
	});

	it('writes nothing when nobody the viewer can see carries the role', async () => {
		const f = fakes([member('mara', 'Pupil')], [photo('p1', 'Pupil')]);
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: 'Teacher', to: 'Coach' });
		expect(f.renames).toHaveLength(0);
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: 'Pupil', to: 'Student' });
		expect(f.renames).toHaveLength(1);
	});

	it('renames a role only photos still carry', async () => {
		const f = fakes([member('mara', 'Pupil')], [photo('p1', 'Teacher')]);
		await renameCircleRole(f.deps, viewer, { circleId: 'class', from: 'Teacher', to: 'Coach' });
		expect(f.renames[0]).toMatchObject({ contactIds: [], photoIds: ['p1'] });
	});
});
