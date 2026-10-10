import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDrizzleCirclePhotoRepository } from '../../db/circle-photo-repository';
import * as schema from '../../db/schema';
import { fixedClock, sequentialIds } from '../testing';
import {
	admin,
	ADMIN,
	author,
	AUTHOR,
	foreignAdmin,
	H,
	member,
	removalDb,
	type RemovalDb
} from '../testing/removal-db';
import { removeCirclePhoto } from './circle-photos';

/*
 * Removing a circle's photo (docs/02 §2.4.2, docs/03 §3.7): whoever added it always, an admin
 * on a shared one in a circle they may see. Wired to the real adapter, where the activity entry
 * shares the delete's transaction.
 */

const NOW = 1_760_000_000_000;

let t: RemovalDb;
let files: string[];
let deps: Parameters<typeof removeCirclePhoto>[0];

function addPhoto(id: string, over: Partial<typeof schema.photo.$inferInsert> = {}) {
	t.db
		.insert(schema.photo)
		.values({
			id,
			householdId: H,
			contactId: null,
			circleId: 'k-class',
			createdBy: AUTHOR,
			visibility: 'shared',
			filePath: `${id}.jpg`,
			thumbPath: `${id}-t.jpg`,
			viewPath: `${id}-v.jpg`,
			mime: 'image/jpeg',
			...over
		})
		.run();
}

const ref = (photoId: string, circleId = 'k-class') => ({ circleId, photoId });
const photoIds = () =>
	t.db
		.select({ id: schema.photo.id })
		.from(schema.photo)
		.all()
		.map((r) => r.id);
const activity = () => t.db.select().from(schema.activityLog).all();

beforeEach(() => {
	t = removalDb();
	files = [];
	deps = {
		circlePhotos: createDrizzleCirclePhotoRepository(t.db),
		media: { put: async () => '', delete: async (path) => void files.push(path) },
		ids: sequentialIds('activity'),
		clock: fixedClock(NOW)
	};
});

describe('removeCirclePhoto: who may', () => {
	it('lets whoever added it remove it, shared or private, and logs nothing', async () => {
		addPhoto('p-shared');
		addPhoto('p-private', { visibility: 'private' });

		expect(await removeCirclePhoto(deps, author, ref('p-shared'))).toBe(true);
		expect(await removeCirclePhoto(deps, author, ref('p-private'))).toBe(true);

		expect(photoIds()).toEqual([]);
		expect(activity()).toEqual([]);
	});

	it("lets an admin remove another member's shared photo, with all three files", async () => {
		addPhoto('p-shared');
		expect(await removeCirclePhoto(deps, admin, ref('p-shared'))).toBe(true);
		expect(photoIds()).toEqual([]);
		expect(files).toEqual(['p-shared.jpg', 'p-shared-t.jpg', 'p-shared-v.jpg']);
	});

	it("refuses an admin on another member's private photo, and keeps it", async () => {
		addPhoto('p-private', { visibility: 'private' });
		expect(await removeCirclePhoto(deps, admin, ref('p-private'))).toBe(false);
		expect(photoIds()).toEqual(['p-private']);
		expect(files).toEqual([]);
	});

	it('refuses a member on a photo someone else added', async () => {
		addPhoto('p-ninas');
		expect(await removeCirclePhoto(deps, member, ref('p-ninas'))).toBe(false);
		expect(photoIds()).toEqual(['p-ninas']);
	});

	it('refuses an admin of another household', async () => {
		addPhoto('p-shared');
		expect(await removeCirclePhoto(deps, foreignAdmin, ref('p-shared'))).toBe(false);
		expect(photoIds()).toEqual(['p-shared']);
	});

	it('refuses an admin in a private circle they cannot see', async () => {
		t.db
			.update(schema.circle)
			.set({ createdBy: AUTHOR })
			.where(eq(schema.circle.id, 'k-secret'))
			.run();
		addPhoto('p-hidden', { circleId: 'k-secret' });
		expect(await removeCirclePhoto(deps, admin, ref('p-hidden', 'k-secret'))).toBe(false);
		expect(photoIds()).toEqual(['p-hidden']);
	});

	it('refuses a photo asked for under another circle, and one that is gone', async () => {
		addPhoto('p-shared');
		expect(await removeCirclePhoto(deps, admin, ref('p-shared', 'k-secret'))).toBe(false);
		expect(await removeCirclePhoto(deps, admin, ref('p-never'))).toBe(false);
		expect(photoIds()).toEqual(['p-shared']);
	});

	it('refuses what is no circle photo: a person photo', async () => {
		addPhoto('p-person', { circleId: null, contactId: 'c-kurt' });
		expect(await removeCirclePhoto(deps, admin, ref('p-person'))).toBe(false);
		expect(photoIds()).toEqual(['p-person']);
	});
});

describe('removeCirclePhoto: the record', () => {
	it("logs an admin's removal once, shared, naming the circle and both members", async () => {
		addPhoto('p-shared', { caption: 'Class trip' });

		await removeCirclePhoto(deps, admin, ref('p-shared'));

		const [entry, ...more] = activity();
		expect(more).toEqual([]);
		expect(entry).toMatchObject({
			householdId: H,
			actorId: ADMIN,
			action: 'delete',
			entityType: 'circle_photo',
			entityId: 'p-shared',
			contactId: null,
			visibility: 'shared',
			createdAt: NOW
		});
		expect(JSON.parse(entry!.summary)).toEqual({
			person: 'Class 3b',
			authorId: AUTHOR,
			authorName: 'Nina'
		});
		expect(entry!.summary).not.toContain('trip');
	});

	it('writes the entry in the same transaction as the delete', async () => {
		addPhoto('p-shared');
		t.sqlite.exec(
			"CREATE TRIGGER no_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT, 'no log'); END"
		);

		await expect(removeCirclePhoto(deps, admin, ref('p-shared'))).rejects.toThrow('no log');
		expect(photoIds()).toEqual(['p-shared']);
		expect(files).toEqual([]);
	});
});
