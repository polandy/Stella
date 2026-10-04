import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import type { StoredFraming } from '../domain/media/framing';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzleCutRepository } from './cut-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * Integration spec for profile pictures cut from a group photo (docs/concepts/circle-photos.md
 * §5): a cut is a framing of a circle photo that one person wears, one per person and photo.
 * Whatever takes a cut off a person — another picture, the group photo going away or turning
 * private — first turns it into a photo of their own, in the same transaction.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const u1: Viewer = { id: U1, householdId: H };
const u2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let cuts: ReturnType<typeof createDrizzleCutRepository>;
let circlePhotos: ReturnType<typeof createDrizzleCirclePhotoRepository>;
let photos: ReturnType<typeof createDrizzlePhotoRepository>;

const groupPhoto = (over: Partial<StoredCirclePhoto> = {}): StoredCirclePhoto => ({
	takenAt: null,
	id: 'class-photo',
	householdId: H,
	circleId: 'class',
	circleRole: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'class.jpg',
	thumbPath: 'class_thumb.jpg',
	viewPath: 'class_view.jpg',
	mime: 'image/jpeg',
	width: 4096,
	height: 2731,
	sizeBytes: 100,
	createdAt: 1000,
	...over
});

const cutOf = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	id: 'cut-anna',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	framingOf: 'class-photo',
	crop: { x: 100, y: 200, size: 300 },
	createdBy: U1,
	visibility: 'shared',
	filePath: 'cut-anna.jpg',
	thumbPath: 'cut-anna_thumb.jpg',
	mime: 'image/jpeg',
	width: 1024,
	height: 1024,
	sizeBytes: 50,
	createdAt: 9000,
	...over
});

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName: id }).run();
}

function seedCircle(id: string, members: string[], visibility: 'shared' | 'private' = 'shared') {
	db.insert(schema.circle).values({ id, householdId: H, createdBy: U1, visibility, name: `Circle ${id}` }).run();
	for (const contactId of members) {
		db.insert(schema.circleMembership)
			.values({ id: `${id}-${contactId}`, circleId: id, contactId, createdBy: U1 })
			.run();
	}
}

const avatarOf = (contactId: string) =>
	db.select({ id: schema.contact.avatarPhotoId }).from(schema.contact).where(eq(schema.contact.id, contactId)).get()
		?.id ?? null;

const row = (id: string) => db.select().from(schema.photo).where(eq(schema.photo.id, id)).get();

beforeEach(async () => {
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
	cuts = createDrizzleCutRepository(db);
	circlePhotos = createDrizzleCirclePhotoRepository(db);
	photos = createDrizzlePhotoRepository(db);
	seedContact('anna');
	seedContact('ben');
	seedCircle('class', ['anna', 'ben']);
	await circlePhotos.insert(groupPhoto());
});

describe('cutting a picture for someone', () => {
	it('stores the cut as a framing of the group photo, worn, and never in their gallery', async () => {
		expect(await cuts.replaceCut(cutOf())).toEqual([]);
		expect(avatarOf('anna')).toBe('cut-anna');
		expect(await photos.listGalleryPhotos(u1, 'anna')).toEqual([]);
		expect(await cuts.listCutsOfCircle(u1, 'class')).toEqual([
			{ groupPhotoId: 'class-photo', contactId: 'anna', crop: { x: 100, y: 200, size: 300 } }
		]);
	});

	it('cuts one group photo for several people, one cut each', async () => {
		await cuts.replaceCut(cutOf());
		await cuts.replaceCut(cutOf({ id: 'cut-ben', contactId: 'ben', filePath: 'b.jpg', thumbPath: 'b_t.jpg' }));
		expect(avatarOf('anna')).toBe('cut-anna');
		expect(avatarOf('ben')).toBe('cut-ben');
		expect((await cuts.listCutsOfCircle(u1, 'class')).map((c) => c.contactId).sort()).toEqual(['anna', 'ben']);
	});

	it('replaces the person’s earlier cut of the same photo and hands back its files', async () => {
		await cuts.replaceCut(cutOf());
		const replaced = await cuts.replaceCut(
			cutOf({ id: 'cut-anna-2', crop: { x: 0, y: 0, size: 400 }, filePath: 'a2.jpg', thumbPath: 'a2_t.jpg' })
		);
		expect(replaced).toEqual([{ filePath: 'cut-anna.jpg', thumbPath: 'cut-anna_thumb.jpg' }]);
		expect(row('cut-anna')).toBeUndefined();
		expect(avatarOf('anna')).toBe('cut-anna-2');
		expect(await photos.listGalleryPhotos(u1, 'anna')).toEqual([]);
	});

	it('finds a group photo by id only when the viewer may see it', async () => {
		await circlePhotos.insert(groupPhoto({ id: 'private-photo', visibility: 'private', createdBy: U1 }));
		expect(await cuts.findVisibleGroupPhoto(u2, 'class-photo')).toEqual({
			id: 'class-photo',
			circleId: 'class',
			createdBy: U1,
			visibility: 'shared',
			width: 4096,
			height: 2731
		});
		expect(await cuts.findVisibleGroupPhoto(u2, 'private-photo')).toBeNull();
		expect(await cuts.findVisibleGroupPhoto(u1, 'private-photo')).not.toBeNull();
	});
});

describe('switching away from a cut', () => {
	const asOwnPhoto = {
		framingOf: null,
		cutFrom: 'class-photo',
		createdAt: 1000,
		cropX: null,
		cropY: null,
		cropSize: null,
		contactId: 'anna'
	};

	it('keeps the cut as the person’s own photo, dated like the group photo, when a new picture is uploaded', async () => {
		await cuts.replaceCut(cutOf());
		await photos.insert({
			id: 'upload',
			householdId: H,
			contactId: 'anna',
			journalEntryId: null,
			createdBy: U2,
			visibility: 'shared',
			filePath: 'u.jpg',
			thumbPath: 'u_t.jpg',
			mime: 'image/jpeg',
			width: 512,
			height: 512,
			sizeBytes: 1,
			takenAt: null,
			createdAt: 20_000
		});
		await photos.setContactAvatar('anna', 'upload');

		expect(avatarOf('anna')).toBe('upload');
		expect(row('cut-anna')).toMatchObject(asOwnPhoto);
		const gallery = await photos.listGalleryPhotos(u1, 'anna');
		expect(gallery.map((p) => p.id)).toEqual(['upload', 'cut-anna']);
		expect(gallery[1]!.cutFrom).toEqual({ photoId: 'class-photo', circleId: 'class', circleName: 'Circle class' });
	});

	it('keeps the cut when the person is framed from one of their gallery photos instead', async () => {
		await cuts.replaceCut(cutOf());
		await photos.insert({
			id: 'holiday',
			householdId: H,
			contactId: 'anna',
			journalEntryId: null,
			createdBy: U1,
			visibility: 'shared',
			filePath: 'h.jpg',
			thumbPath: 'h_t.jpg',
			mime: 'image/jpeg',
			width: 1600,
			height: 1200,
			sizeBytes: 1,
			takenAt: null,
			createdAt: 20_000
		});
		await photos.replaceFraming(cutOf({ id: 'holiday-frame', framingOf: 'holiday', filePath: 'hf.jpg', thumbPath: 'hf_t.jpg' }));
		expect(avatarOf('anna')).toBe('holiday-frame');
		expect(row('cut-anna')).toMatchObject(asOwnPhoto);
	});

	it('keeps the cut when the person is cut from another group photo', async () => {
		await circlePhotos.insert(groupPhoto({ id: 'team-photo', filePath: 't.jpg', thumbPath: 't_t.jpg', createdAt: 3000 }));
		await cuts.replaceCut(cutOf());
		await cuts.replaceCut(cutOf({ id: 'cut-anna-team', framingOf: 'team-photo', filePath: 'at.jpg', thumbPath: 'at_t.jpg' }));
		expect(avatarOf('anna')).toBe('cut-anna-team');
		expect(row('cut-anna')).toMatchObject(asOwnPhoto);
	});
});

describe('a group photo that people wear going away', () => {
	it('turns each cut into its person’s own photo, still worn, before the group photo is removed', async () => {
		await cuts.replaceCut(cutOf());
		await cuts.replaceCut(cutOf({ id: 'cut-ben', contactId: 'ben', filePath: 'b.jpg', thumbPath: 'b_t.jpg' }));

		const removed = await circlePhotos.deleteOwn({ authorId: U1, circleId: 'class', photoId: 'class-photo' });

		expect(removed).toEqual({ filePath: 'class.jpg', thumbPath: 'class_thumb.jpg', viewPath: 'class_view.jpg' });
		expect(row('class-photo')).toBeUndefined();
		expect(avatarOf('anna')).toBe('cut-anna');
		expect(avatarOf('ben')).toBe('cut-ben');
		// Nothing is left pointing at a photo that is gone.
		expect(row('cut-anna')).toMatchObject({ framingOf: null, cutFrom: null, createdAt: 1000 });
		const gallery = await photos.listGalleryPhotos(u2, 'anna');
		expect(gallery.map((p) => [p.id, p.isAvatar, p.cutFrom])).toEqual([['cut-anna', true, null]]);
	});

	it('forgets the group photo on the photos earlier cuts became', async () => {
		await cuts.replaceCut(cutOf());
		await photos.insert({
			id: 'upload',
			householdId: H,
			contactId: 'anna',
			journalEntryId: null,
			createdBy: U2,
			visibility: 'shared',
			filePath: 'u.jpg',
			thumbPath: 'u_t.jpg',
			mime: 'image/jpeg',
			width: 512,
			height: 512,
			sizeBytes: 1,
			takenAt: null,
			createdAt: 20_000
		});
		await photos.setContactAvatar('anna', 'upload');
		await circlePhotos.deleteOwn({ authorId: U1, circleId: 'class', photoId: 'class-photo' });
		expect(row('cut-anna')).toMatchObject({ cutFrom: null });
	});

	it('turns no cut when someone else tries to remove the photo', async () => {
		await cuts.replaceCut(cutOf());
		expect(await circlePhotos.deleteOwn({ authorId: U2, circleId: 'class', photoId: 'class-photo' })).toBeNull();
		expect(row('cut-anna')).toMatchObject({ framingOf: 'class-photo' });
	});

	it('turns each cut into its person’s own shared photo, still worn, when the group photo turns private', async () => {
		await cuts.replaceCut(cutOf());

		expect(
			await circlePhotos.setOwnVisibility({ authorId: U1, circleId: 'class', photoId: 'class-photo', visibility: 'private' })
		).toBe(true);

		expect(row('class-photo')).toMatchObject({ visibility: 'private' });
		expect(row('cut-anna')).toMatchObject({ framingOf: null, cutFrom: 'class-photo', visibility: 'shared' });
		expect(avatarOf('anna')).toBe('cut-anna');
		// The other member still sees the face, though no longer the group photo it came from.
		const gallery = await photos.listGalleryPhotos(u2, 'anna');
		expect(gallery.map((p) => [p.id, p.cutFrom])).toEqual([['cut-anna', null]]);
	});

	it('lets the cuts of a private photo follow it when it is shared again', async () => {
		await circlePhotos.insert(groupPhoto({ id: 'mine', visibility: 'private', createdBy: U2, filePath: 'm.jpg', thumbPath: 'm_t.jpg' }));
		await cuts.replaceCut(cutOf({ id: 'cut-mine', framingOf: 'mine', createdBy: U2, visibility: 'private' }));
		await circlePhotos.setOwnVisibility({ authorId: U2, circleId: 'class', photoId: 'mine', visibility: 'shared' });
		expect(row('cut-mine')).toMatchObject({ framingOf: 'mine', visibility: 'shared' });
	});
});

describe('what the pages read', () => {
	it('names only the wearers the viewer can see, and counts the rest', async () => {
		seedContact('secret', 'private', U1);
		await cuts.replaceCut(cutOf());
		await cuts.replaceCut(cutOf({ id: 'cut-secret', contactId: 'secret', filePath: 's.jpg', thumbPath: 's_t.jpg' }));
		const seen = await cuts.listCutsOfCircle(u2, 'class');
		expect(seen.map((c) => c.contactId).sort((a, b) => String(a).localeCompare(String(b)))).toEqual(['anna', null]);
		expect(seen.find((c) => c.contactId === null)?.crop).toBeNull();
	});

	it('lists the group photos a person was cut from, now and before, but not one the viewer cannot see', async () => {
		await circlePhotos.insert(groupPhoto({ id: 'team-photo', filePath: 't.jpg', thumbPath: 't_t.jpg', createdAt: 3000 }));
		await circlePhotos.insert(groupPhoto({ id: 'private', visibility: 'private', createdBy: U1, filePath: 'p.jpg', thumbPath: 'p_t.jpg', createdAt: 5000 }));
		await cuts.replaceCut(cutOf());
		await cuts.replaceCut(cutOf({ id: 'cut-team', framingOf: 'team-photo', filePath: 'at.jpg', thumbPath: 'at_t.jpg' }));
		await cuts.replaceCut(cutOf({ id: 'cut-private', framingOf: 'private', visibility: 'private', filePath: 'ap.jpg', thumbPath: 'ap_t.jpg' }));

		const ofAnna = (viewer: Viewer) => cuts.listGroupPhotosOf(viewer, 'anna');
		expect((await ofAnna(u1)).map((p) => p.id)).toEqual(['private', 'team-photo', 'class-photo']);
		expect(await ofAnna(u2)).toEqual([
			{ id: 'team-photo', circleId: 'class', circleName: 'Circle class', takenAt: null, createdAt: 3000 },
			{ id: 'class-photo', circleId: 'class', circleName: 'Circle class', takenAt: null, createdAt: 1000 }
		]);
	});

	it('orders the group photos by when they were taken when their EXIF said so', async () => {
		// Added after the class photo (at 1 s), but taken at the epoch itself.
		await circlePhotos.insert(
			groupPhoto({ id: 'old-scan', filePath: 'o.jpg', thumbPath: 'o_t.jpg', createdAt: 9000, takenAt: '1970-01-01T00:00:00Z' })
		);
		await cuts.replaceCut(cutOf());
		await cuts.replaceCut(cutOf({ id: 'cut-scan', framingOf: 'old-scan', filePath: 'as.jpg', thumbPath: 'as_t.jpg' }));

		const ofAnna = await cuts.listGroupPhotosOf(u2, 'anna');
		expect(ofAnna.map((p) => [p.id, p.takenAt])).toEqual([
			['class-photo', null],
			['old-scan', '1970-01-01T00:00:00Z']
		]);
		expect((await cuts.listGroupPhotosToCut(u2, 'anna')).map((p) => p.id)).toEqual(['class-photo', 'old-scan']);
	});

	it('offers the photos of the person’s own circles to cut from, with the square they wear', async () => {
		seedContact('cleo');
		seedCircle('team', ['cleo']);
		await circlePhotos.insert(groupPhoto({ id: 'team-photo', circleId: 'team', filePath: 't.jpg', thumbPath: 't_t.jpg' }));
		await circlePhotos.insert(groupPhoto({ id: 'private', visibility: 'private', createdBy: U1, filePath: 'p.jpg', thumbPath: 'p_t.jpg', createdAt: 5000 }));
		await cuts.replaceCut(cutOf());

		expect(await cuts.listGroupPhotosToCut(u2, 'anna')).toEqual([
			{
				id: 'class-photo',
				circleId: 'class',
				circleName: 'Circle class',
				takenAt: null,
				createdAt: 1000,
				width: 4096,
				height: 2731,
				crop: { x: 100, y: 200, size: 300 }
			}
		]);
		expect((await cuts.listGroupPhotosToCut(u1, 'anna')).map((p) => [p.id, p.crop])).toEqual([
			['private', null],
			['class-photo', { x: 100, y: 200, size: 300 }]
		]);
		expect((await cuts.listGroupPhotosToCut(u1, 'cleo')).map((p) => p.id)).toEqual(['team-photo']);
	});

	it('serves a circle photo’s 1600 px view, and the full picture where there is none', async () => {
		await circlePhotos.insert(groupPhoto({ id: 'old', viewPath: null, filePath: 'old.jpg', thumbPath: 'old_t.jpg' }));
		expect(await photos.getVisiblePhotoFile(u2, 'class-photo', 'view')).toEqual({ path: 'class_view.jpg', mime: 'image/jpeg' });
		expect(await photos.getVisiblePhotoFile(u2, 'class-photo', 'full')).toEqual({ path: 'class.jpg', mime: 'image/jpeg' });
		expect(await photos.getVisiblePhotoFile(u2, 'old', 'view')).toEqual({ path: 'old.jpg', mime: 'image/jpeg' });
	});
});
