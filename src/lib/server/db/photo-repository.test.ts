import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { StoredPhoto } from '../domain/media/avatars';
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
	db.insert(schema.contact).values({ id, householdId: H, createdBy, visibility, displayName: id }).run();
}

const photo = (over: Partial<StoredPhoto> = {}): StoredPhoto => ({
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
		expect(await repo.getVisiblePhotoFile(viewerU1, 'p1', 'full')).toEqual({ path: 'p1.jpg', mime: 'image/jpeg' });
		expect(await repo.getVisiblePhotoFile(viewerU1, 'p1', 'thumb')).toEqual({ path: 'p1_thumb.jpg', mime: 'image/jpeg' });
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
