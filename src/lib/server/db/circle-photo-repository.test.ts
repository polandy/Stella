import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzlePhotoFileReads } from './photo-file-reads';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * Integration spec for the circle photo adapter (docs/02 §2.4.2): reads are scoped by the
 * circle's visibility and the photo's own (docs/03 §3.7), re-scoping and removing are the
 * uploader's, and a circle photo never turns up as anyone's gallery photo.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const u1: Viewer = { id: U1, householdId: H };
const u2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleCirclePhotoRepository>;

const stored = (over: Partial<StoredCirclePhoto> = {}): StoredCirclePhoto => ({
	takenAt: null,
	id: 'p1',
	householdId: H,
	circleId: 'class',
	circleRole: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'p1.jpg',
	thumbPath: 'p1_thumb.jpg',
	viewPath: 'p1_view.jpg',
	mime: 'image/jpeg',
	width: 1600,
	height: 900,
	sizeBytes: 100,
	createdAt: 10,
	...over
});

function seedCircle(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.circle).values({ id, householdId: H, createdBy, visibility, name: id }).run();
}

const ids = (photos: { id: string }[]) => photos.map((p) => p.id).sort();

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
	repo = createDrizzleCirclePhotoRepository(db);
	seedCircle('class');
});

describe('listVisible / findVisible', () => {
	it('lists a circle’s shared photos and the viewer’s own private ones, with role and pin', async () => {
		await repo.insert(stored({ id: 'shared', circleRole: 'Student' }));
		await repo.insert(stored({ id: 'mine', visibility: 'private', createdBy: U2 }));
		await repo.insert(stored({ id: 'theirs', visibility: 'private', createdBy: U1 }));
		expect(ids(await repo.listVisible(u2, 'class'))).toEqual(['mine', 'shared']);
		const shared = await repo.findVisible(u2, 'class', 'shared');
		expect(shared).toEqual({
			id: 'shared',
			circleId: 'class',
			role: 'Student',
			caption: null,
			visibility: 'shared',
			createdBy: U1,
			createdByName: 'One',
			width: 1600,
			height: 900,
			takenAt: null,
			createdAt: 10,
			pinnedAt: null
		});
		expect(await repo.findVisible(u2, 'class', 'theirs')).toBeNull();
	});

	it('hides every photo of a private circle from all but its owner', async () => {
		seedCircle('secret', 'private', U1);
		await repo.insert(stored({ id: 's', circleId: 'secret' }));
		expect(await repo.listVisible(u2, 'secret')).toEqual([]);
		expect(ids(await repo.listVisible(u1, 'secret'))).toEqual(['s']);
	});

	it('finds a photo only in the circle it belongs to', async () => {
		seedCircle('team');
		await repo.insert(stored({ id: 't', circleId: 'team' }));
		expect(await repo.findVisible(u1, 'class', 't')).toBeNull();
		expect(await repo.listVisible(u1, 'class')).toEqual([]);
	});
});

describe('describe', () => {
	it('changes caption, role and pin', async () => {
		await repo.insert(stored());
		await repo.describe('p1', { caption: 'First day', role: 'Teacher', pinnedAt: 77 });
		const photo = await repo.findVisible(u1, 'class', 'p1');
		expect([photo?.caption, photo?.role, photo?.pinnedAt]).toEqual(['First day', 'Teacher', 77]);
	});

	it('leaves alone what it was not asked to change', async () => {
		await repo.insert(stored({ circleRole: 'Student' }));
		await repo.describe('p1', { caption: 'x' });
		expect((await repo.findVisible(u1, 'class', 'p1'))?.role).toBe('Student');
	});
});

describe('setOwnVisibility', () => {
	it('lets only the uploader re-scope a photo', async () => {
		await repo.insert(stored());
		expect(
			await repo.setOwnVisibility({
				authorId: U2,
				circleId: 'class',
				photoId: 'p1',
				visibility: 'private'
			})
		).toBe(false);
		expect(
			await repo.setOwnVisibility({
				authorId: U1,
				circleId: 'class',
				photoId: 'p1',
				visibility: 'private'
			})
		).toBe(true);
		expect(await repo.listVisible(u2, 'class')).toEqual([]);
	});
});

describe('listCoverCandidates', () => {
	it('reads the photos of every circle the viewer may see, and no others', async () => {
		seedCircle('secret', 'private', U1);
		await repo.insert(stored({ id: 'a' }));
		await repo.insert(stored({ id: 'b', circleId: 'secret' }));
		expect(ids(await repo.listCoverCandidates(u2))).toEqual(['a']);
		expect(ids(await repo.listCoverCandidates(u1))).toEqual(['a', 'b']);
	});
});

describe('beside the person photos', () => {
	it('serves a circle photo’s file by the circle’s rules', async () => {
		const photoFiles = createDrizzlePhotoFileReads(db);
		seedCircle('secret', 'private', U1);
		await repo.insert(stored({ id: 'open' }));
		await repo.insert(
			stored({ id: 'hidden', circleId: 'secret', filePath: 'h.jpg', thumbPath: 'h_t.jpg' })
		);
		expect(await photoFiles.getVisiblePhotoFile(u2, 'open', 'thumb')).toEqual({
			path: 'p1_thumb.jpg',
			mime: 'image/jpeg'
		});
		expect(await photoFiles.getVisiblePhotoFile(u2, 'hidden', 'full')).toBeNull();
		expect(await photoFiles.getVisiblePhotoFile(u1, 'hidden', 'full')).toEqual({
			path: 'h.jpg',
			mime: 'image/jpeg'
		});
	});

	it('never lets the person gallery’s writes reach a circle photo', async () => {
		const photos = createDrizzlePhotoRepository(db);
		await repo.insert(stored());
		expect(await photos.updateOwnGalleryPhoto({ authorId: U1, photoId: 'p1', caption: 'x' })).toBe(
			false
		);
		expect(
			await photos.deleteRemovableGalleryPhoto({ ...u1, isAdmin: true }, 'p1', null)
		).toBeNull();
		await photos.setGalleryPhotoPin('p1', 5);
		const photo = await repo.findVisible(u1, 'class', 'p1');
		expect([photo?.caption, photo?.pinnedAt]).toEqual([null, null]);
	});
});
