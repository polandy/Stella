import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Remover } from '../access/visibility';
import { activityRecord } from '../domain/activity/activity';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import type { CircleRepository } from '../domain/circles/circles';
import type { StoredFraming } from '../domain/media/framing';
import { fixedClock, sequentialIds } from '../domain/testing';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleCutRepository } from './cut-repository';
import { createDrizzleGalleryPhotoReads } from './gallery-photo-reads';
import * as schema from './schema';

/*
 * Integration spec for deleting a circle (docs/02 §2.4.2, docs/03 `circle`): one transaction
 * scoped by `circleDeletableBy`, which turns the cuts of the circle's photos into their wearers'
 * own photos, deletes the photos and hands back their files, deletes the circle — its
 * memberships cascade, its children lose their parent — and logs `circle.deleted`. What the
 * remover cannot see goes too, and is counted beforehand.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const creator: Remover = { id: U1, householdId: H, isAdmin: false };
const member: Remover = { id: U2, householdId: H, isAdmin: false };
const admin: Remover = { id: U2, householdId: H, isAdmin: true };

let db: BunSQLiteDatabase<typeof schema>;
let circles: CircleRepository;

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id })
		.run();
}

function seedCircle(
	id: string,
	members: string[],
	over: Partial<typeof schema.circle.$inferInsert> = {}
) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', name: id, ...over })
		.run();
	for (const contactId of members) {
		db.insert(schema.circleMembership)
			.values({ id: `${id}-${contactId}`, circleId: id, contactId, createdBy: U1 })
			.run();
	}
}

const circlePhoto = (over: Partial<StoredCirclePhoto>): StoredCirclePhoto => ({
	id: 'class-photo',
	householdId: H,
	circleId: 'class',
	circleRole: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'class.jpg',
	thumbPath: 'class_t.jpg',
	viewPath: 'class_v.jpg',
	mime: 'image/jpeg',
	width: 4096,
	height: 2731,
	sizeBytes: 100,
	takenAt: null,
	createdAt: 1000,
	...over
});

const cutOf = (over: Partial<StoredFraming>): StoredFraming => ({
	id: 'cut-anna',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	framingOf: 'class-photo',
	crop: { x: 100, y: 200, size: 300 },
	createdBy: U1,
	visibility: 'shared',
	filePath: 'cut-anna.jpg',
	thumbPath: 'cut-anna_t.jpg',
	mime: 'image/jpeg',
	width: 1024,
	height: 1024,
	sizeBytes: 50,
	createdAt: 9000,
	...over
});

const audit = (remover: Remover) =>
	activityRecord({ ids: sequentialIds('log-1'), clock: fixedClock(5000) }, remover, {
		kind: 'circle.deleted',
		circleId: 'class',
		name: 'class',
		visibility: 'shared'
	});

const photoRow = (id: string) =>
	db.select().from(schema.photo).where(eq(schema.photo.id, id)).get();
const circleRow = (id: string) =>
	db.select().from(schema.circle).where(eq(schema.circle.id, id)).get();
const membershipsOf = (circleId: string) =>
	db
		.select({ contactId: schema.circleMembership.contactId })
		.from(schema.circleMembership)
		.where(eq(schema.circleMembership.circleId, circleId))
		.all()
		.map((m) => m.contactId)
		.sort();
const avatarOf = (contactId: string) =>
	db
		.select({ id: schema.contact.avatarPhotoId })
		.from(schema.contact)
		.where(eq(schema.contact.id, contactId))
		.get()?.id ?? null;
const logRows = () => db.select().from(schema.activityLog).all();

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
	circles = createDrizzleCircleRepository(db);

	// U1's shared class: two members U1 sees, one only U2 sees; a shared photo Anna wears a cut
	// of, and U2's private photo Ben wears a cut of. Choir is nested in it, and so is U2's
	// private reading group. Anna is in the choir too, with a photo of its own.
	seedContact('anna');
	seedContact('ben');
	seedContact('hidden', 'private', U2);
	seedCircle('class', ['anna', 'ben', 'hidden']);
	seedCircle('choir', ['anna'], { parentCircleId: 'class', name: 'Choir' });
	seedCircle('reading', [], {
		parentCircleId: 'class',
		name: 'Reading',
		createdBy: U2,
		visibility: 'private'
	});
	const circlePhotos = createDrizzleCirclePhotoRepository(db);
	await circlePhotos.insert(circlePhoto({}));
	await circlePhotos.insert(
		circlePhoto({
			id: 'private-photo',
			createdBy: U2,
			visibility: 'private',
			filePath: 'priv.jpg',
			thumbPath: 'priv_t.jpg',
			viewPath: null
		})
	);
	await circlePhotos.insert(
		circlePhoto({ id: 'choir-photo', circleId: 'choir', filePath: 'choir.jpg' })
	);
	const cuts = createDrizzleCutRepository(db);
	await cuts.replaceCut(cutOf({}));
	await cuts.replaceCut(
		cutOf({
			id: 'cut-ben',
			contactId: 'ben',
			framingOf: 'private-photo',
			createdBy: U2,
			visibility: 'private',
			filePath: 'cut-ben.jpg',
			thumbPath: 'cut-ben_t.jpg'
		})
	);
});

describe('readDeletion', () => {
	it('counts the members the remover sees, and every photo and cut, theirs or not', async () => {
		const facts = await circles.readDeletion(creator, 'class');

		expect(facts).toMatchObject({ name: 'class', visibleMembers: 2 });
		expect(facts?.photoIds.sort()).toEqual(['class-photo', 'private-photo']);
		expect(facts?.cuts.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: 'cut-anna', contactId: 'anna', groupPhotoId: 'class-photo' },
			{ id: 'cut-ben', contactId: 'ben', groupPhotoId: 'private-photo' }
		]);
	});

	it('marks the children the remover sees, and keeps the others for counting', async () => {
		const facts = await circles.readDeletion(creator, 'class');

		expect(facts?.children.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: 'choir', name: 'Choir', visible: true },
			{ id: 'reading', name: 'Reading', visible: false }
		]);
	});

	it('answers null to a member who did not create it, and the facts to an admin', async () => {
		expect(await circles.readDeletion(member, 'class')).toBeNull();
		expect(await circles.readDeletion(admin, 'class')).toMatchObject({ visibleMembers: 3 });
	});

	it('answers null for a circle that is not there', async () => {
		expect(await circles.readDeletion(creator, 'gone')).toBeNull();
	});
});

describe('deleteDeletable', () => {
	it('deletes the circle with its memberships, and its children stay without a parent', async () => {
		expect(await circles.deleteDeletable(creator, 'class', audit(creator))).not.toBeNull();

		expect(circleRow('class')).toBeUndefined();
		expect(membershipsOf('class')).toEqual([]);
		expect(circleRow('choir')).toMatchObject({ parentCircleId: null });
		expect(circleRow('reading')).toMatchObject({ parentCircleId: null });
		// The child keeps everything of its own.
		expect(membershipsOf('choir')).toEqual(['anna']);
		expect(photoRow('choir-photo')).toMatchObject({ circleId: 'choir' });
	});

	it('deletes every photo of the circle, the remover’s or not, and hands back their files', async () => {
		const files = await circles.deleteDeletable(creator, 'class', audit(creator));

		expect(files?.sort((a, b) => a.filePath.localeCompare(b.filePath))).toEqual([
			{ filePath: 'class.jpg', thumbPath: 'class_t.jpg', viewPath: 'class_v.jpg' },
			{ filePath: 'priv.jpg', thumbPath: 'priv_t.jpg', viewPath: null }
		]);
		expect(photoRow('class-photo')).toBeUndefined();
		expect(photoRow('private-photo')).toBeUndefined();
	});

	it('turns each worn cut into its wearer’s own photo, still worn, before the photos go', async () => {
		await circles.deleteDeletable(creator, 'class', audit(creator));

		expect(avatarOf('anna')).toBe('cut-anna');
		expect(avatarOf('ben')).toBe('cut-ben');
		expect(photoRow('cut-anna')).toMatchObject({
			contactId: 'anna',
			framingOf: null,
			cutFrom: null,
			filePath: 'cut-anna.jpg'
		});
		// Made shared as it leaves the private photo, as when one turns private (docs/03 `photo`).
		expect(photoRow('cut-ben')).toMatchObject({ contactId: 'ben', framingOf: null, cutFrom: null });
		const gallery = await createDrizzleGalleryPhotoReads(db).listGalleryPhotos(
			{ id: U1, householdId: H },
			'anna'
		);
		expect(gallery.map((p) => [p.id, p.isAvatar])).toEqual([['cut-anna', true]]);
	});

	it('logs the deletion in the same write', async () => {
		await circles.deleteDeletable(creator, 'class', audit(creator));

		expect(logRows()).toEqual([
			expect.objectContaining({
				actorId: U1,
				action: 'delete',
				entityType: 'circle',
				entityId: 'class',
				contactId: null,
				visibility: 'shared',
				summary: JSON.stringify({ name: 'class' })
			})
		]);
	});

	it('changes nothing for a member who did not create it, and lets an admin', async () => {
		expect(await circles.deleteDeletable(member, 'class', audit(member))).toBeNull();
		expect(circleRow('class')).toBeDefined();
		expect(membershipsOf('class')).toEqual(['anna', 'ben', 'hidden']);
		expect(photoRow('class-photo')).toBeDefined();
		expect(photoRow('cut-anna')).toMatchObject({ framingOf: 'class-photo' });
		expect(logRows()).toEqual([]);

		expect(await circles.deleteDeletable(admin, 'class', audit(admin))).not.toBeNull();
		expect(circleRow('class')).toBeUndefined();
	});

	it('answers null for a circle that is not there', async () => {
		expect(await circles.deleteDeletable(creator, 'gone', audit(creator))).toBeNull();
		expect(logRows()).toEqual([]);
	});
});
