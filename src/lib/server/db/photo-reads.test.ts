import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { PhotoFileReads, PhotoRepository, StoredPhoto } from '../domain/media/avatars';
import type { GalleryPhotoReads } from '../domain/media/gallery';
import type { JournalPhotoReads } from '../domain/media/journal-photos';
import { createDrizzleGalleryPhotoReads } from './gallery-photo-reads';
import { createDrizzleJournalPhotoReads } from './journal-photo-reads';
import { createDrizzlePhotoFileReads } from './photo-file-reads';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * Integration spec for the photo read models over SQLite: which file `/media` serves, the
 * gallery and the journal photos, each only where the viewer may see the photo (contact visible
 * + photo shared-or-owned, §3.7). The photos are stored through the PhotoRepository.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: PhotoRepository;
let gallery: GalleryPhotoReads;
let files: PhotoFileReads;
let journalPhotos: JournalPhotoReads;

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
	gallery = createDrizzleGalleryPhotoReads(db);
	files = createDrizzlePhotoFileReads(db);
	journalPhotos = createDrizzleJournalPhotoReads(db);
});

describe('getVisiblePhotoFile', () => {
	it('returns the full or thumb path with mime', async () => {
		seedContact('mara');
		await repo.insert(photo());
		expect(await files.getVisiblePhotoFile(viewerU1, 'p1', 'full')).toEqual({
			path: 'p1.jpg',
			mime: 'image/jpeg'
		});
		expect(await files.getVisiblePhotoFile(viewerU1, 'p1', 'thumb')).toEqual({
			path: 'p1_thumb.jpg',
			mime: 'image/jpeg'
		});
	});

	it('hides a photo whose contact the viewer cannot see', async () => {
		seedContact('mara', 'private', U1); // private contact owned by U1
		await repo.insert(photo());
		expect(await files.getVisiblePhotoFile(viewerU2, 'p1', 'full')).toBeNull();
		expect(await files.getVisiblePhotoFile(viewerU1, 'p1', 'full')).not.toBeNull();
	});

	it('hides a private photo from non-authors even on a shared contact', async () => {
		seedContact('mara', 'shared');
		await repo.insert(photo({ visibility: 'private', createdBy: U1 }));
		expect(await files.getVisiblePhotoFile(viewerU2, 'p1', 'full')).toBeNull();
		expect(await files.getVisiblePhotoFile(viewerU1, 'p1', 'full')).not.toBeNull();
	});

	it('returns null for an unknown photo', async () => {
		expect(await files.getVisiblePhotoFile(viewerU1, 'nope', 'full')).toBeNull();
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
		const forU2 = await gallery.listGalleryPhotos(viewerU2, 'mara');
		expect(forU2.map((p) => p.id)).toEqual(['g-u2', 'g-shared']);
		// Positive control: the author sees their private one, in the same order.
		const forU1 = await gallery.listGalleryPhotos(viewerU1, 'mara');
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

		const listed = await gallery.listGalleryPhotos(viewerU1, 'mara');
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

	it('keeps journal photos out of the gallery', async () => {
		const ids = (await gallery.listGalleryPhotos(viewerU1, 'mara')).map((p) => p.id);
		expect(ids).not.toContain('in-journal');
	});

	it('marks the photo the contact currently wears', async () => {
		await repo.setContactAvatar('mara', 'g-shared');
		const found = await gallery.listGalleryPhotos(viewerU1, 'mara');
		expect(found.filter((p) => p.isAvatar).map((p) => p.id)).toEqual(['g-shared']);
	});

	it('finds one gallery photo only for the right contact and viewer', async () => {
		expect(await gallery.findVisibleGalleryPhoto(viewerU1, 'mara', 'g-shared')).toMatchObject({
			id: 'g-shared'
		});
		seedContact('otto');
		expect(await gallery.findVisibleGalleryPhoto(viewerU1, 'otto', 'g-shared')).toBeNull();
		expect(await gallery.findVisibleGalleryPhoto(viewerU2, 'mara', 'g-private')).toBeNull();
		expect(await gallery.findVisibleGalleryPhoto(viewerU1, 'mara', 'in-journal')).toBeNull();
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
			const all = await journalPhotos.listJournalPhotos(viewer, 'mara');
			const page = await journalPhotos.listJournalPhotosOfEntries(viewer, 'mara', ['j1', 'j2']);
			expect(page).toEqual(all.filter((p) => p.journalEntryId !== 'j3'));
		}
		// Not vacuous: oldest first, and a private photo only for its author.
		expect(
			(await journalPhotos.listJournalPhotosOfEntries(viewerU1, 'mara', ['j1', 'j2'])).map(
				(p) => p.id
			)
		).toEqual(['b', 'c', 'a', 'e']);
		expect(
			(await journalPhotos.listJournalPhotosOfEntries(viewerU2, 'mara', ['j1', 'j2'])).map(
				(p) => p.id
			)
		).toEqual(['b', 'c', 'a']);
	});

	it('reads nothing for a page without entries', async () => {
		expect(await journalPhotos.listJournalPhotosOfEntries(viewerU1, 'mara', [])).toEqual([]);
	});
});
