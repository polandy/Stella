import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { StoredPhoto } from '../domain/media/avatars';
import type { StoredFraming } from '../domain/media/framing';
import { pinGalleryPhoto } from '../domain/media/gallery';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle PhotoRepository: setting a contact avatar and serving a
 * photo file only when the viewer may see it (contact visible + photo shared-or-owned, §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzlePhotoRepository>;

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id })
		.run();
}

const photo = (over: Partial<StoredPhoto> = {}): StoredPhoto => ({
	takenAt: null,
	id: 'p1',
	householdId: H,
	contactId: 'mara',
	journalEntryId: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'p1.jpg',
	thumbPath: 'p1_thumb.jpg',
	mime: 'image/jpeg',
	width: 512,
	height: 512,
	sizeBytes: 1234,
	createdAt: 0,
	...over
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	repo = createDrizzlePhotoRepository(db);
});

describe('setContactAvatar', () => {
	it('points the contact at the photo', async () => {
		seedContact('mara');
		await repo.insert(photo());
		await repo.setContactAvatar('mara', 'p1');
		const row = db
			.select({ a: schema.contact.avatarPhotoId })
			.from(schema.contact)
			.where(eq(schema.contact.id, 'mara'))
			.get();
		expect(row?.a).toBe('p1');
	});
});

describe('getVisiblePhotoFile', () => {
	it('returns the full or thumb path with mime', async () => {
		seedContact('mara');
		await repo.insert(photo());
		expect(await repo.getVisiblePhotoFile(viewerU1, 'p1', 'full')).toEqual({
			path: 'p1.jpg',
			mime: 'image/jpeg'
		});
		expect(await repo.getVisiblePhotoFile(viewerU1, 'p1', 'thumb')).toEqual({
			path: 'p1_thumb.jpg',
			mime: 'image/jpeg'
		});
	});

	it('hides a photo whose contact the viewer cannot see', async () => {
		seedContact('mara', 'private', U1); // private contact owned by U1
		await repo.insert(photo());
		expect(await repo.getVisiblePhotoFile(viewerU2, 'p1', 'full')).toBeNull();
		expect(await repo.getVisiblePhotoFile(viewerU1, 'p1', 'full')).not.toBeNull();
	});

	it('hides a private photo from non-authors even on a shared contact', async () => {
		seedContact('mara', 'shared');
		await repo.insert(photo({ visibility: 'private', createdBy: U1 }));
		expect(await repo.getVisiblePhotoFile(viewerU2, 'p1', 'full')).toBeNull();
		expect(await repo.getVisiblePhotoFile(viewerU1, 'p1', 'full')).not.toBeNull();
	});

	it('returns null for an unknown photo', async () => {
		expect(await repo.getVisiblePhotoFile(viewerU1, 'nope', 'full')).toBeNull();
	});
});

describe('the gallery (docs/02 §2.14)', () => {
	/*
	 * A gallery photo is one with no journal entry. U1 owns a shared and a private one on
	 * Mara; U2 owns one of their own. Journal photos must stay out of every gallery read.
	 */
	beforeEach(async () => {
		seedContact('mara');
		await repo.insert(photo({ id: 'g-shared', createdAt: 100 }));
		await repo.insert(photo({ id: 'g-private', visibility: 'private', createdAt: 200 }));
		await repo.insert(photo({ id: 'g-u2', createdBy: U2, createdAt: 300 }));
		db.insert(schema.journalEntry)
			.values({ id: 'j1', contactId: 'mara', createdBy: U1, entryDate: '2026-01-01', body: 'x' })
			.run();
		await repo.insert(photo({ id: 'in-journal', journalEntryId: 'j1', createdAt: 400 }));
		// A caption is written after the upload, the way the interface does it.
		await repo.updateOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared', caption: 'At the lake' });
	});

	it('lists the gallery newest first, hiding a private photo from everyone but its author', async () => {
		const forU2 = await repo.listGalleryPhotos(viewerU2, 'mara');
		expect(forU2.map((p) => p.id)).toEqual(['g-u2', 'g-shared']);
		// Positive control: the author sees their private one, in the same order.
		const forU1 = await repo.listGalleryPhotos(viewerU1, 'mara');
		expect(forU1.map((p) => p.id)).toEqual(['g-u2', 'g-private', 'g-shared']);
		expect(forU1.find((p) => p.id === 'g-shared')).toMatchObject({
			caption: 'At the lake',
			visibility: 'shared',
			createdBy: U1,
			contactId: 'mara',
			isAvatar: false,
			framing: null,
			pinnedAt: null
		});
	});

	it('orders by the capture when known — offset and all — and hands the date back', async () => {
		// Capture dates are whole seconds, so the photos above are moved to 100, 200 and 300 s.
		for (const [id, seconds] of [
			['g-shared', 100],
			['g-private', 200],
			['g-u2', 300]
		] as const) {
			db.update(schema.photo)
				.set({ createdAt: seconds * 1000 })
				.where(eq(schema.photo.id, id))
				.run();
		}
		// Both added after everything else, but taken at 150 s and at 250 s. The second says
		// 01:04:10 at +01:00, which is 250 s; read without its offset it would lead the list.
		await repo.insert(
			photo({ id: 'taken-150s', createdAt: 900_000, takenAt: '1970-01-01T00:02:30' })
		);
		await repo.insert(
			photo({ id: 'taken-250s', createdAt: 900_000, takenAt: '1970-01-01T01:04:10+01:00' })
		);

		const listed = await repo.listGalleryPhotos(viewerU1, 'mara');
		expect(listed.map((p) => p.id)).toEqual([
			'g-u2',
			'taken-250s',
			'g-private',
			'taken-150s',
			'g-shared'
		]);
		expect(listed.find((p) => p.id === 'taken-250s')?.takenAt).toBe('1970-01-01T01:04:10+01:00');
		expect(listed.find((p) => p.id === 'g-u2')?.takenAt).toBeNull();
	});

	it('pins and unpins a gallery photo for everyone who sees it', async () => {
		await repo.setGalleryPhotoPin('g-shared', 1_000);
		expect(
			(await repo.listGalleryPhotos(viewerU2, 'mara')).find((p) => p.id === 'g-shared')?.pinnedAt
		).toBe(1_000);
		expect((await repo.findVisibleGalleryPhoto(viewerU1, 'mara', 'g-shared'))?.pinnedAt).toBe(
			1_000
		);
		await repo.setGalleryPhotoPin('g-shared', null);
		expect((await repo.findVisibleGalleryPhoto(viewerU2, 'mara', 'g-shared'))?.pinnedAt).toBeNull();
	});

	it('pins nothing but a gallery photo', async () => {
		await repo.setGalleryPhotoPin('in-journal', 1_000);
		await repo.setGalleryPhotoPin('g-shared', 1_000);
		const pinOf = (id: string) =>
			db.select().from(schema.photo).where(eq(schema.photo.id, id)).get()?.pinnedAt;
		expect(pinOf('in-journal')).toBeNull();
		// Positive control: the same call does pin a gallery photo.
		expect(pinOf('g-shared')).toBe(1_000);
	});

	it('lets a member pin only a photo they can see, through the use-case and the real scoping', async () => {
		const deps = { photos: repo, clock: { now: () => 2_000 } };
		const pinOf = (id: string) =>
			db.select().from(schema.photo).where(eq(schema.photo.id, id)).get()?.pinnedAt;
		seedContact('otto');

		// U1's private photo is invisible to U2, so U2 cannot pin it, whether or not it exists.
		expect(
			await pinGalleryPhoto(deps, viewerU2, {
				contactId: 'mara',
				photoId: 'g-private',
				pinned: true
			})
		).toBe(false);
		// Nor through another person's page.
		expect(
			await pinGalleryPhoto(deps, viewerU1, {
				contactId: 'otto',
				photoId: 'g-shared',
				pinned: true
			})
		).toBe(false);
		expect(pinOf('g-private')).toBeNull();
		expect(pinOf('g-shared')).toBeNull();

		// Positive controls: U2 pins the shared photo U1 added, and U1 pins their own private one.
		expect(
			await pinGalleryPhoto(deps, viewerU2, {
				contactId: 'mara',
				photoId: 'g-shared',
				pinned: true
			})
		).toBe(true);
		expect(
			await pinGalleryPhoto(deps, viewerU1, {
				contactId: 'mara',
				photoId: 'g-private',
				pinned: true
			})
		).toBe(true);
		expect(pinOf('g-shared')).toBe(2_000);
		expect(pinOf('g-private')).toBe(2_000);
	});

	it('keeps journal photos out of the gallery', async () => {
		const ids = (await repo.listGalleryPhotos(viewerU1, 'mara')).map((p) => p.id);
		expect(ids).not.toContain('in-journal');
	});

	it('marks the photo the contact currently wears', async () => {
		await repo.setContactAvatar('mara', 'g-shared');
		const found = await repo.listGalleryPhotos(viewerU1, 'mara');
		expect(found.filter((p) => p.isAvatar).map((p) => p.id)).toEqual(['g-shared']);
	});

	it('finds one gallery photo only for the right contact and viewer', async () => {
		expect(await repo.findVisibleGalleryPhoto(viewerU1, 'mara', 'g-shared')).toMatchObject({
			id: 'g-shared'
		});
		seedContact('otto');
		expect(await repo.findVisibleGalleryPhoto(viewerU1, 'otto', 'g-shared')).toBeNull();
		expect(await repo.findVisibleGalleryPhoto(viewerU2, 'mara', 'g-private')).toBeNull();
		expect(await repo.findVisibleGalleryPhoto(viewerU1, 'mara', 'in-journal')).toBeNull();
	});

	it('updates caption and visibility only on the author’s own photo', async () => {
		expect(
			await repo.updateOwnGalleryPhoto({ authorId: U2, photoId: 'g-shared', caption: 'Mine' })
		).toBe(false);
		expect(
			await repo.updateOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared', caption: 'Ours' })
		).toBe(true);
		expect(
			await repo.updateOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared', visibility: 'private' })
		).toBe(true);
		const row = db.select().from(schema.photo).where(eq(schema.photo.id, 'g-shared')).get();
		expect(row).toMatchObject({ caption: 'Ours', visibility: 'private' });
	});

	it('deletes only the author’s own photo and hands back its files', async () => {
		expect(await repo.deleteOwnGalleryPhoto({ authorId: U2, photoId: 'g-shared' })).toBeNull();
		expect(await repo.deleteOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared' })).toEqual([
			{ filePath: 'p1.jpg', thumbPath: 'p1_thumb.jpg' }
		]);
		expect(
			db.select().from(schema.photo).where(eq(schema.photo.id, 'g-shared')).get()
		).toBeUndefined();
	});

	it('takes the avatar off the contact when the photo it points at is deleted', async () => {
		await repo.setContactAvatar('mara', 'g-shared');
		await repo.deleteOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared' });
		const row = db.select().from(schema.contact).where(eq(schema.contact.id, 'mara')).get();
		expect(row?.avatarPhotoId).toBeNull();
	});
});

describe('framings (docs/02 §2.14)', () => {
	/*
	 * A framing is the square someone chose to wear a gallery photo as the avatar: a photo row of
	 * its own, pointing at the gallery photo. U1 owns a shared and a private photo on Mara.
	 */
	const framing = (over: Partial<StoredFraming> = {}): StoredFraming => ({
		...photo({ id: 'f1', filePath: 'f1.jpg', thumbPath: 'f1_thumb.jpg', createdAt: 900 }),
		framingOf: 'g-shared',
		crop: { x: 100, y: 50, size: 300 },
		...over
	});

	beforeEach(async () => {
		seedContact('mara');
		await repo.insert(photo({ id: 'g-shared', createdAt: 100 }));
		await repo.insert(photo({ id: 'g-private', visibility: 'private', createdAt: 200 }));
	});

	it('wears the framing and marks its photo as the one worn, with the square remembered', async () => {
		expect(await repo.replaceFraming(framing())).toEqual([]);
		const contactRow = db.select().from(schema.contact).where(eq(schema.contact.id, 'mara')).get();
		expect(contactRow?.avatarPhotoId).toBe('f1');

		const gallery = await repo.listGalleryPhotos(viewerU1, 'mara');
		// The framing is not a second photo in the gallery.
		expect(gallery.map((p) => p.id)).toEqual(['g-private', 'g-shared']);
		expect(gallery.find((p) => p.id === 'g-shared')).toMatchObject({
			isAvatar: true,
			framing: { x: 100, y: 50, size: 300 }
		});
		expect(gallery.find((p) => p.id === 'g-private')).toMatchObject({
			isAvatar: false,
			framing: null
		});
	});

	it('serves the framing under its own id, to whoever may see its photo', async () => {
		await repo.replaceFraming(framing());
		expect(await repo.getVisiblePhotoFile(viewerU2, 'f1', 'thumb')).toEqual({
			path: 'f1_thumb.jpg',
			mime: 'image/jpeg'
		});
	});

	it('replaces the earlier framing of the same photo and hands back its files', async () => {
		await repo.replaceFraming(framing());
		const replaced = await repo.replaceFraming(
			framing({
				id: 'f2',
				filePath: 'f2.jpg',
				thumbPath: 'f2_thumb.jpg',
				crop: { x: 0, y: 0, size: 512 }
			})
		);
		expect(replaced).toEqual([{ filePath: 'f1.jpg', thumbPath: 'f1_thumb.jpg' }]);
		const ids = db
			.select({ id: schema.photo.id })
			.from(schema.photo)
			.all()
			.map((r) => r.id);
		expect(ids.sort()).toEqual(['f2', 'g-private', 'g-shared']);
		const gallery = await repo.listGalleryPhotos(viewerU1, 'mara');
		expect(gallery.find((p) => p.id === 'g-shared')?.framing).toEqual({ x: 0, y: 0, size: 512 });
	});

	it('keeps the framing of a photo no longer worn, so choosing it again starts there', async () => {
		await repo.replaceFraming(framing());
		await repo.setContactAvatar('mara', 'g-private');
		const gallery = await repo.listGalleryPhotos(viewerU1, 'mara');
		expect(gallery.find((p) => p.id === 'g-shared')).toMatchObject({
			isAvatar: false,
			framing: { x: 100, y: 50, size: 300 }
		});
		expect(gallery.find((p) => p.id === 'g-private')?.isAvatar).toBe(true);
	});

	it('cannot be found, re-scoped or deleted as a gallery photo of its own', async () => {
		await repo.replaceFraming(framing());
		expect(await repo.findVisibleGalleryPhoto(viewerU1, 'mara', 'f1')).toBeNull();
		expect(await repo.updateOwnGalleryPhoto({ authorId: U1, photoId: 'f1', caption: 'x' })).toBe(
			false
		);
		expect(await repo.deleteOwnGalleryPhoto({ authorId: U1, photoId: 'f1' })).toBeNull();
		// Positive control: the photo it frames is all of those things.
		expect(await repo.findVisibleGalleryPhoto(viewerU1, 'mara', 'g-shared')).toMatchObject({
			id: 'g-shared'
		});
	});

	it('follows its photo when the photo is made private', async () => {
		await repo.replaceFraming(framing());
		await repo.updateOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared', visibility: 'private' });
		expect(await repo.getVisiblePhotoFile(viewerU2, 'f1', 'thumb')).toBeNull();
		expect(await repo.getVisiblePhotoFile(viewerU1, 'f1', 'thumb')).not.toBeNull();
	});

	it('goes with its photo, files and avatar included', async () => {
		await repo.replaceFraming(framing());
		expect(await repo.deleteOwnGalleryPhoto({ authorId: U1, photoId: 'g-shared' })).toEqual([
			{ filePath: 'p1.jpg', thumbPath: 'p1_thumb.jpg' },
			{ filePath: 'f1.jpg', thumbPath: 'f1_thumb.jpg' }
		]);
		expect(db.select().from(schema.photo).where(eq(schema.photo.id, 'f1')).get()).toBeUndefined();
		const row = db.select().from(schema.contact).where(eq(schema.contact.id, 'mara')).get();
		expect(row?.avatarPhotoId).toBeNull();
	});
});

describe('listJournalPhotosOfEntries', () => {
	function entry(id: string, entryDate: string) {
		db.insert(schema.journalEntry)
			.values({ id, contactId: 'mara', createdBy: U1, entryDate, body: id })
			.run();
	}

	beforeEach(async () => {
		seedContact('mara');
		entry('j1', '2026-01-01');
		entry('j2', '2026-01-02');
		entry('j3', '2026-01-03');
		await repo.insert(photo({ id: 'a', journalEntryId: 'j1', createdAt: 3 }));
		await repo.insert(photo({ id: 'b', journalEntryId: 'j1', createdAt: 1 }));
		await repo.insert(photo({ id: 'c', journalEntryId: 'j2', createdAt: 2 }));
		await repo.insert(photo({ id: 'd', journalEntryId: 'j3', createdAt: 4 }));
		await repo.insert(
			photo({ id: 'e', journalEntryId: 'j2', visibility: 'private', createdAt: 5 })
		);
		await repo.insert(photo({ id: 'g', journalEntryId: null }));
	});

	it("is the person's journal photos cut to the entries a story page shows", async () => {
		for (const viewer of [viewerU1, viewerU2]) {
			const all = await repo.listJournalPhotos(viewer, 'mara');
			const page = await repo.listJournalPhotosOfEntries(viewer, 'mara', ['j1', 'j2']);
			expect(page).toEqual(all.filter((p) => p.journalEntryId !== 'j3'));
		}
		// Not vacuous: oldest first, and a private photo only for its author.
		expect(
			(await repo.listJournalPhotosOfEntries(viewerU1, 'mara', ['j1', 'j2'])).map((p) => p.id)
		).toEqual(['b', 'c', 'a', 'e']);
		expect(
			(await repo.listJournalPhotosOfEntries(viewerU2, 'mara', ['j1', 'j2'])).map((p) => p.id)
		).toEqual(['b', 'c', 'a']);
	});

	it('reads nothing for a page without entries', async () => {
		expect(await repo.listJournalPhotosOfEntries(viewerU1, 'mara', [])).toEqual([]);
	});
});
