import { describe, expect, it } from 'bun:test';
import type { Remover } from '../../access/visibility';
import type { ActivityOf } from '../activity/activity';
import { circleRepositoryWith, fixedClock, sequentialIds } from '../testing';
import { CircleGoneError } from './circle-details';
import type { Circle } from './circles';
import {
	circleDeletable,
	circleDeletionPreview,
	deleteCircle,
	type CircleDeletionFacts,
	type DeletedCirclePhotoFiles
} from './delete-circle';

/*
 * Deleting a circle (docs/02 §2.4.2): its creator always, an admin when it is shared. The
 * preview counts what goes — members the remover sees, every photo, every wearer — and names
 * the children that stay; the deletion logs `circle.deleted` with the write and unlinks the
 * photo files only once the write has committed. Who may is the repository's SQL condition
 * (`circleDeletableBy`); the fakes here answer as that condition would.
 */

const NOW = 1_700_000_000_000;
const remover: Remover = { id: 'u1', householdId: 'h1', isAdmin: false };

const class1b: Circle = {
	id: 'k1',
	householdId: 'h1',
	createdBy: 'u1',
	visibility: 'private',
	name: 'Class 1B',
	description: null,
	kind: 'class',
	color: 'blue',
	startDate: null,
	endDate: null
};

const facts = (over: Partial<CircleDeletionFacts> = {}): CircleDeletionFacts => ({
	name: 'Class 1B',
	visibleMembers: 24,
	photoIds: ['p1', 'p2', 'p3'],
	cuts: [],
	children: [],
	...over
});

describe('circleDeletionPreview', () => {
	it('counts the members the remover sees and every photo', async () => {
		const circles = circleRepositoryWith({ readDeletion: async () => facts() });

		expect(await circleDeletionPreview({ circles }, remover, 'k1')).toEqual({
			name: 'Class 1B',
			members: 24,
			photos: 3,
			wornPhotos: 0,
			wearers: 0,
			children: { named: [], unnamed: 0 }
		});
	});

	it('counts the worn photos and their wearers, each once, whoever sees them', async () => {
		// Ben wears cuts of two photos; Cleo's cut is of a photo only its uploader sees.
		const cuts = [
			{ id: 'c1', contactId: 'anna', groupPhotoId: 'p1' },
			{ id: 'c2', contactId: 'ben', groupPhotoId: 'p1' },
			{ id: 'c3', contactId: 'ben', groupPhotoId: 'p2' },
			{ id: 'c4', contactId: 'cleo', groupPhotoId: 'p-private-of-someone-else' }
		];
		const circles = circleRepositoryWith({
			readDeletion: async () =>
				facts({ photoIds: ['p1', 'p2', 'p3', 'p-private-of-someone-else'], cuts })
		});

		expect(await circleDeletionPreview({ circles }, remover, 'k1')).toMatchObject({
			photos: 4,
			wornPhotos: 3,
			wearers: 3
		});
	});

	it('names the children the remover sees, by name, and only counts the rest', async () => {
		const circles = circleRepositoryWith({
			readDeletion: async () =>
				facts({
					children: [
						{ id: 'k3', name: 'Class 1B Reading group', visible: true },
						{ id: 'k4', name: 'Secret club', visible: false },
						{ id: 'k2', name: 'Class 1B Choir', visible: true }
					]
				})
		});

		expect((await circleDeletionPreview({ circles }, remover, 'k1')).children).toEqual({
			named: [
				{ id: 'k2', name: 'Class 1B Choir' },
				{ id: 'k3', name: 'Class 1B Reading group' }
			],
			unnamed: 1
		});
	});

	it('answers CircleGoneError for a circle the remover may not delete, cannot see, or is gone', async () => {
		const circles = circleRepositoryWith({ readDeletion: async () => null });

		await expect(circleDeletionPreview({ circles }, remover, 'k1')).rejects.toBeInstanceOf(
			CircleGoneError
		);
	});
});

/** A repository whose deletion records what it was handed and answers `deleted`. */
function deletingRepo(deleted: DeletedCirclePhotoFiles[] | null, visible: Circle | null = class1b) {
	const events: string[] = [];
	const audits: ActivityOf<'circle.deleted'>[] = [];
	const circles = circleRepositoryWith({
		getVisibleTo: async () => visible,
		deleteDeletable: async (_remover, _circleId, audit) => {
			events.push('delete');
			audits.push(audit);
			return deleted;
		}
	});
	const media = {
		delete: async (path: string) => {
			events.push(`unlink ${path}`);
		}
	};
	return {
		deps: { circles, media, ids: sequentialIds('log-1'), clock: fixedClock(NOW) },
		events,
		audits
	};
}

describe('deleteCircle', () => {
	it('logs the deletion with the write, under the circle’s name and visibility', async () => {
		const { deps, audits } = deletingRepo([]);

		await deleteCircle(deps, remover, 'k1');

		expect(audits).toEqual([
			{
				id: 'log-1',
				householdId: 'h1',
				actorId: 'u1',
				createdAt: NOW,
				event: { kind: 'circle.deleted', circleId: 'k1', name: 'Class 1B', visibility: 'private' }
			}
		]);
	});

	it('unlinks every file of the deleted photos, only after the write', async () => {
		const { deps, events } = deletingRepo([
			{ filePath: 'p1.jpg', thumbPath: 'p1_t.jpg', viewPath: 'p1_v.jpg' },
			{ filePath: 'p2.jpg', thumbPath: 'p2_t.jpg', viewPath: null }
		]);

		await deleteCircle(deps, remover, 'k1');

		expect(events).toEqual([
			'delete',
			'unlink p1.jpg',
			'unlink p1_t.jpg',
			'unlink p1_v.jpg',
			'unlink p2.jpg',
			'unlink p2_t.jpg'
		]);
	});

	it('answers CircleGoneError, and deletes nothing, for a circle the remover cannot see', async () => {
		const { deps, events } = deletingRepo([], null);

		await expect(deleteCircle(deps, remover, 'k1')).rejects.toBeInstanceOf(CircleGoneError);
		expect(events).toEqual([]);
	});

	it('answers CircleGoneError, and unlinks nothing, when the write finds nothing it may delete', async () => {
		const { deps, events } = deletingRepo(null);

		await expect(deleteCircle(deps, remover, 'k1')).rejects.toBeInstanceOf(CircleGoneError);
		expect(events).toEqual(['delete']);
	});
});

describe('circleDeletable', () => {
	it('offers the deletion to the creator, and to an admin on a shared circle only', () => {
		const admin: Remover = { id: 'u2', householdId: 'h1', isAdmin: true };
		const member: Remover = { id: 'u3', householdId: 'h1', isAdmin: false };
		const shared = { ...class1b, visibility: 'shared' as const };

		expect(circleDeletable(remover, class1b)).toBe(true);
		expect(circleDeletable(admin, shared)).toBe(true);
		expect(circleDeletable(member, shared)).toBe(false);
		// A private circle is its creator's alone: an admin does not even see it.
		expect(circleDeletable(admin, class1b)).toBe(false);
	});
});
