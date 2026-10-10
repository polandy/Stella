import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDrizzlePhotoRepository } from '../../db/photo-repository';
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
	MEMBER,
	removalDb,
	type RemovalDb
} from '../testing/removal-db';
import { removeGalleryPhoto } from './gallery';

/*
 * Removing a person's photo (docs/02 §2.14, docs/03 §3.7): whoever added it always, an admin on
 * a shared one. Wired to the real adapter: its framing, the avatar that wore it and the
 * activity entry in the same transaction live there.
 */

const NOW = 1_760_000_000_000;

let t: RemovalDb;
let files: string[];
let deps: Parameters<typeof removeGalleryPhoto>[0];

function addPhoto(id: string, over: Partial<typeof schema.photo.$inferInsert> = {}) {
	t.db
		.insert(schema.photo)
		.values({
			id,
			householdId: H,
			contactId: 'c-kurt',
			createdBy: AUTHOR,
			visibility: 'shared',
			filePath: `${id}.jpg`,
			thumbPath: `${id}-t.jpg`,
			mime: 'image/jpeg',
			...over
		})
		.run();
}

const photoIds = () =>
	t.db
		.select({ id: schema.photo.id })
		.from(schema.photo)
		.all()
		.map((r) => r.id);
const activity = () => t.db.select().from(schema.activityLog).all();
const avatarOf = (contactId: string) =>
	t.db.select().from(schema.contact).where(eq(schema.contact.id, contactId)).get()?.avatarPhotoId;

beforeEach(() => {
	t = removalDb();
	files = [];
	deps = {
		photos: createDrizzlePhotoRepository(t.db),
		media: { delete: async (path) => void files.push(path) },
		ids: sequentialIds('activity'),
		clock: fixedClock(NOW)
	};
});

describe('removeGalleryPhoto: who may', () => {
	it('lets whoever added it remove their photo, shared or private, and logs nothing', async () => {
		addPhoto('p-shared');
		addPhoto('p-private', { visibility: 'private' });

		expect(await removeGalleryPhoto(deps, author, 'p-shared')).toBe(true);
		expect(await removeGalleryPhoto(deps, author, 'p-private')).toBe(true);

		expect(photoIds()).toEqual([]);
		expect(activity()).toEqual([]);
	});

	it("lets an admin remove another member's shared photo", async () => {
		addPhoto('p-shared');
		expect(await removeGalleryPhoto(deps, admin, 'p-shared')).toBe(true);
		expect(photoIds()).toEqual([]);
	});

	it("refuses an admin on another member's private photo, and keeps it", async () => {
		addPhoto('p-private', { visibility: 'private' });
		addPhoto('p-control');

		expect(await removeGalleryPhoto(deps, admin, 'p-private')).toBe(false);
		expect(await removeGalleryPhoto(deps, admin, 'p-control')).toBe(true);
		expect(photoIds()).toEqual(['p-private']);
		expect(files).toEqual(['p-control.jpg', 'p-control-t.jpg']);
	});

	it("refuses a member on someone else's shared photo", async () => {
		addPhoto('p-ninas');
		addPhoto('p-mias', { createdBy: MEMBER });

		expect(await removeGalleryPhoto(deps, member, 'p-ninas')).toBe(false);
		expect(await removeGalleryPhoto(deps, member, 'p-mias')).toBe(true);
		expect(photoIds()).toEqual(['p-ninas']);
	});

	it('refuses an admin of another household', async () => {
		addPhoto('p-shared');
		expect(await removeGalleryPhoto(deps, foreignAdmin, 'p-shared')).toBe(false);
		expect(await removeGalleryPhoto(deps, admin, 'p-shared')).toBe(true);
	});

	it('refuses what is no gallery photo: a framing, a journal photo, a circle photo', async () => {
		addPhoto('p-gallery');
		addPhoto('p-framing', { framingOf: 'p-gallery' });
		addPhoto('p-circle', { contactId: null, circleId: 'k-class' });
		t.db
			.insert(schema.journalEntry)
			.values({
				id: 'j-1',
				contactId: 'c-kurt',
				createdBy: AUTHOR,
				entryDate: '2026-10-08',
				body: 'x'
			})
			.run();
		addPhoto('p-journal', { journalEntryId: 'j-1' });

		for (const id of ['p-framing', 'p-circle', 'p-journal']) {
			expect(await removeGalleryPhoto(deps, admin, id)).toBe(false);
		}
		expect(photoIds().sort()).toEqual(['p-circle', 'p-framing', 'p-gallery', 'p-journal']);
		expect(files).toEqual([]);
	});

	it('answers a photo that is gone like one the remover may not touch', async () => {
		expect(await removeGalleryPhoto(deps, admin, 'p-never')).toBe(false);
		expect(activity()).toEqual([]);
	});
});

describe('removeGalleryPhoto: what goes with it', () => {
	it('takes its framing and files along, and the avatar that wore either', async () => {
		addPhoto('p-worn');
		addPhoto('p-worn-framing', { framingOf: 'p-worn' });
		t.db
			.update(schema.contact)
			.set({ avatarPhotoId: 'p-worn-framing' })
			.where(eq(schema.contact.id, 'c-kurt'))
			.run();

		await removeGalleryPhoto(deps, admin, 'p-worn');

		expect(photoIds()).toEqual([]);
		expect(avatarOf('c-kurt')).toBeNull();
		expect(files).toEqual([
			'p-worn.jpg',
			'p-worn-t.jpg',
			'p-worn-framing.jpg',
			'p-worn-framing-t.jpg'
		]);
	});

	it("logs an admin's removal once, shared, naming kind, person and both members", async () => {
		addPhoto('p-shared', { caption: 'Birthday in secret' });

		await removeGalleryPhoto(deps, admin, 'p-shared');

		const [entry, ...more] = activity();
		expect(more).toEqual([]);
		expect(entry).toMatchObject({
			householdId: H,
			actorId: ADMIN,
			action: 'delete',
			entityType: 'photo',
			entityId: 'p-shared',
			contactId: 'c-kurt',
			visibility: 'shared',
			createdAt: NOW
		});
		expect(JSON.parse(entry!.summary)).toEqual({
			person: 'Kurt',
			authorId: AUTHOR,
			authorName: 'Nina'
		});
		expect(entry!.summary).not.toContain('Birthday');
	});

	it('keeps the entry as private as the person when the person is private', async () => {
		addPhoto('p-on-secret', { contactId: 'c-secret' });
		await removeGalleryPhoto(deps, admin, 'p-on-secret');
		expect(activity().map((a) => a.visibility)).toEqual(['private']);
	});

	it('writes the entry in the same transaction as the delete', async () => {
		addPhoto('p-shared');
		t.sqlite.exec(
			"CREATE TRIGGER no_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT, 'no log'); END"
		);

		await expect(removeGalleryPhoto(deps, admin, 'p-shared')).rejects.toThrow('no log');
		expect(photoIds()).toEqual(['p-shared']);
		expect(files).toEqual([]);
	});
});
