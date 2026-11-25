import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { createDrizzlePersonFaceReads } from './person-face-reads';
import * as schema from './schema';

// A person's faces: square pictures, framings and cuts, dated, only what the reader may see (§2.4.2).

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const u1: Viewer = { id: U1, householdId: H };
const u2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let reads: ReturnType<typeof createDrizzlePersonFaceReads>;

type PhotoRow = typeof schema.photo.$inferInsert;
function seedPhoto(id: string, over: Partial<PhotoRow> = {}) {
	db.insert(schema.photo)
		.values({
			id,
			householdId: H,
			contactId: 'anna',
			createdBy: U1,
			visibility: 'shared',
			filePath: `${id}.jpg`,
			thumbPath: `${id}_thumb.jpg`,
			mime: 'image/jpeg',
			width: 800,
			height: 800,
			createdAt: 5000,
			...over
		})
		.run();
}

function seedCircle(id: string, visibility: 'shared' | 'private' = 'shared') {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: U1, visibility, name: id })
		.run();
}

const TAKEN = '2018-10-05T10:00:00Z';
const TAKEN_MS = Date.parse(TAKEN);

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
	for (const id of ['anna', 'ben'])
		db.insert(schema.contact)
			.values({ id, householdId: H, createdBy: U1, visibility: 'shared', displayName: id })
			.run();
	reads = createDrizzlePersonFaceReads(db);
});

const ids = async (viewer: Viewer = u1, people = ['anna']) =>
	(await reads.listFacesOfVisibleTo(viewer, people)).map((f) => f.photoId).sort();

describe('listFacesOfVisibleTo', () => {
	it('reads nothing for nobody', async () => {
		seedPhoto('square');
		expect(await reads.listFacesOfVisibleTo(u1, [])).toEqual([]);
	});

	it('takes a square picture, dated by its capture, else the day it was added', async () => {
		seedPhoto('taken', { takenAt: TAKEN });
		seedPhoto('added', { createdAt: 7000 });
		const faces = await reads.listFacesOfVisibleTo(u1, ['anna']);
		expect(faces.sort((a, b) => a.photoId.localeCompare(b.photoId))).toEqual([
			{ contactId: 'anna', photoId: 'added', datedAt: 7000, circleId: null },
			{ contactId: 'anna', photoId: 'taken', datedAt: TAKEN_MS, circleId: null }
		]);
	});

	it('leaves out a gallery photo that is not square, or has no size', async () => {
		seedPhoto('wide', { width: 1600, height: 900 });
		seedPhoto('unknown', { width: null, height: null });
		seedPhoto('square');
		expect(await ids()).toEqual(['square']);
	});

	it('dates a framing by the gallery photo it frames', async () => {
		seedPhoto('wide', { width: 1600, height: 900, takenAt: TAKEN });
		seedPhoto('frame', { framingOf: 'wide', createdAt: 9000 });
		expect(await reads.listFacesOfVisibleTo(u1, ['anna'])).toEqual([
			{ contactId: 'anna', photoId: 'frame', datedAt: TAKEN_MS, circleId: null }
		]);
	});

	it('gives a cut its circle and the group photo’s date', async () => {
		seedCircle('class');
		seedPhoto('group', {
			contactId: null,
			circleId: 'class',
			width: 4000,
			height: 3000,
			takenAt: TAKEN
		});
		seedPhoto('cut', { framingOf: 'group', createdAt: 9000 });
		expect(await reads.listFacesOfVisibleTo(u1, ['anna'])).toEqual([
			{ contactId: 'anna', photoId: 'cut', datedAt: TAKEN_MS, circleId: 'class' }
		]);
	});

	it('gives a former cut its circle and date while the reader sees the group photo', async () => {
		seedCircle('class');
		seedPhoto('group', {
			contactId: null,
			circleId: 'class',
			width: 4000,
			height: 3000,
			takenAt: TAKEN
		});
		seedPhoto('former', { cutFrom: 'group', createdAt: 9000 });
		expect(await reads.listFacesOfVisibleTo(u1, ['anna'])).toEqual([
			{ contactId: 'anna', photoId: 'former', datedAt: TAKEN_MS, circleId: 'class' }
		]);
	});

	it('keeps a former cut as a plain face when its group photo is private to another', async () => {
		seedCircle('class');
		seedPhoto('group', {
			contactId: null,
			circleId: 'class',
			width: 4000,
			height: 3000,
			takenAt: TAKEN,
			visibility: 'private',
			createdBy: U2
		});
		seedPhoto('former', { cutFrom: 'group', createdAt: 9000 });
		expect(await reads.listFacesOfVisibleTo(u1, ['anna'])).toEqual([
			{ contactId: 'anna', photoId: 'former', datedAt: 9000, circleId: null }
		]);
	});

	it('leaves out a cut from a group photo the reader cannot see', async () => {
		seedCircle('class');
		seedCircle('secret', 'private');
		seedPhoto('group', {
			contactId: null,
			circleId: 'class',
			width: 4000,
			height: 3000,
			visibility: 'private',
			createdBy: U1
		});
		seedPhoto('cut', { framingOf: 'group', createdBy: U1 });
		seedPhoto('hidden-group', { contactId: null, circleId: 'secret', width: 4000, height: 3000 });
		seedPhoto('hidden-cut', { framingOf: 'hidden-group', contactId: 'ben' });
		expect(await ids(u1, ['anna', 'ben'])).toEqual(['cut', 'hidden-cut']);
		expect(await ids(u2, ['anna', 'ben'])).toEqual([]);
	});

	it('leaves out a picture private to another, and a framing of one', async () => {
		seedPhoto('mine', { visibility: 'private', createdBy: U2 });
		seedPhoto('wide', { width: 1600, height: 900, visibility: 'private', createdBy: U2 });
		seedPhoto('frame', { framingOf: 'wide' });
		expect(await ids(u1)).toEqual([]);
		expect(await ids(u2)).toEqual(['frame', 'mine']);
	});

	it('leaves out journal photos, circle photos and framings of someone else’s photo', async () => {
		db.insert(schema.journalEntry)
			.values({
				id: 'entry',
				contactId: 'anna',
				createdBy: U1,
				entryDate: '2018-10-05',
				subjectKey: 'anna',
				body: 'x'
			})
			.run();
		seedCircle('class');
		seedPhoto('journal', { journalEntryId: 'entry' });
		seedPhoto('in-circle', { circleId: 'class' });
		seedPhoto('bens', { contactId: 'ben', width: 1600, height: 900 });
		seedPhoto('frame-of-bens', { framingOf: 'bens' });
		expect(await ids()).toEqual([]);
	});

	it('reads several people at once, each face under its person', async () => {
		seedPhoto('a');
		seedPhoto('b', { contactId: 'ben' });
		const faces = await reads.listFacesOfVisibleTo(u1, ['anna', 'ben']);
		expect(faces.map((f) => `${f.contactId}:${f.photoId}`).sort()).toEqual(['anna:a', 'ben:b']);
	});
});
