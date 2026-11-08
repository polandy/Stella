import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { MemoryQuery } from '../domain/memories/memories';
import { createDrizzleMemoryRepository } from './memory-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle MemoryRepository (docs/02 §2.12.1): each kind reads its
 * `MM-DD` column, before the day, newest first — and only what the viewer may see: another
 * member's private entry, a person the household archived, another household's day never come
 * back; a person who died keeps theirs.
 */

const H = 'household-1';
const OTHER = 'household-2';
const U1 = 'user-1';
const U2 = 'user-2';
const asU1: Viewer = { id: U1, householdId: H };
const asU2: Viewer = { id: U2, householdId: H };
const ON_1_NOV: MemoryQuery = { days: ['11-01'], before: '2026-11-01', limit: 10 };

type Vis = 'shared' | 'private';
let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleMemoryRepository>;

function seedContact(id: string, over: Partial<typeof schema.contact.$inferInsert> = {}): void {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy: U1, displayName: id, ...over })
		.run();
}

function seedEntry(
	id: string,
	contactId: string,
	entryDate: string,
	visibility: Vis = 'shared',
	at = 0
) {
	db.insert(schema.journalEntry)
		.values({
			id,
			contactId,
			subjectKey: contactId,
			createdBy: U1,
			visibility,
			entryDate,
			body: `moment ${id}`,
			createdAt: at,
			updatedAt: at
		})
		.run();
}

function seedTouchpoint(
	id: string,
	contactId: string,
	happenedAt: string,
	visibility: Vis = 'shared'
) {
	db.insert(schema.interaction)
		.values({ id, contactId, createdBy: U1, visibility, kind: 'call', happenedAt, title: id })
		.run();
}

function seedPhoto(id: string, over: Partial<typeof schema.photo.$inferInsert>) {
	db.insert(schema.photo)
		.values({
			id,
			householdId: H,
			contactId: 'hilde',
			createdBy: U1,
			filePath: `${id}.jpg`,
			thumbPath: `${id}.thumb.jpg`,
			mime: 'image/jpeg',
			...over
		})
		.run();
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER, name: 'O' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' },
			{ id: 'stranger', householdId: OTHER, email: 's@x.test', name: 'Stranger' }
		])
		.run();
	seedContact('hilde');
	repo = createDrizzleMemoryRepository(db);
});

describe('momentsOn', () => {
	it('reads the day and month in earlier years, newest year first', async () => {
		seedEntry('then', 'hilde', '2021-11-01');
		seedEntry('lately', 'hilde', '2025-11-01');
		seedEntry('today', 'hilde', '2026-11-01');
		seedEntry('next-day', 'hilde', '2025-11-02');
		seedEntry('other-month', 'hilde', '2025-10-01');
		const moments = await repo.momentsOn(asU1, ON_1_NOV);
		expect(moments.map((m) => m.id)).toEqual(['lately', 'then']);
		expect(moments[0]).toMatchObject({
			anchor: { id: 'hilde', name: 'hilde' },
			actor: { id: U1, name: 'One' },
			body: 'moment lately'
		});
	});

	it('reads 29 February when asked with 28 February', async () => {
		seedEntry('leap', 'hilde', '2024-02-29');
		seedEntry('common', 'hilde', '2025-02-28');
		const moments = await repo.momentsOn(asU1, {
			days: ['02-28', '02-29'],
			before: '2027-02-28',
			limit: 10
		});
		expect(moments.map((m) => m.id)).toEqual(['common', 'leap']);
	});

	it("keeps another member's private moment to its author", async () => {
		seedEntry('mine', 'hilde', '2025-11-01', 'private');
		expect((await repo.momentsOn(asU1, ON_1_NOV)).map((m) => m.id)).toEqual(['mine']);
		expect(await repo.momentsOn(asU2, ON_1_NOV)).toEqual([]);
	});

	it('leaves out an archived person but keeps one who died', async () => {
		seedContact('moved-away', { archivedAt: 1 });
		seedContact('karl', { isDeceased: 1, deathDate: '2023-03-04' });
		seedEntry('archived', 'moved-away', '2025-11-01');
		seedEntry('remembered', 'karl', '2021-11-01');
		expect((await repo.momentsOn(asU1, ON_1_NOV)).map((m) => m.id)).toEqual(['remembered']);
	});

	it("never reads another household's day", async () => {
		db.insert(schema.contact)
			.values({ id: 'theirs', householdId: OTHER, createdBy: 'stranger', displayName: 'Theirs' })
			.run();
		db.insert(schema.journalEntry)
			.values({
				id: 'foreign',
				contactId: 'theirs',
				subjectKey: 'theirs',
				createdBy: 'stranger',
				entryDate: '2025-11-01',
				body: 'not yours'
			})
			.run();
		expect(await repo.momentsOn(asU1, ON_1_NOV)).toEqual([]);
	});

	it('stops at the limit', async () => {
		for (const year of [2019, 2020, 2021, 2022]) seedEntry(`y${year}`, 'hilde', `${year}-11-01`);
		const moments = await repo.momentsOn(asU1, { ...ON_1_NOV, limit: 2 });
		expect(moments.map((m) => m.id)).toEqual(['y2022', 'y2021']);
	});
});

describe('touchpointsOn', () => {
	it('reads the touchpoints of the day in earlier years, scoped', async () => {
		seedContact('secret', { visibility: 'private', createdBy: U2 });
		seedTouchpoint('call', 'hilde', '2024-11-01');
		seedTouchpoint('private', 'hilde', '2023-11-01', 'private');
		seedTouchpoint('elsewhere', 'hilde', '2024-11-03');
		db.insert(schema.interactionParticipant)
			.values([
				{ interactionId: 'call', contactId: 'secret' },
				{ interactionId: 'call', contactId: 'hilde' }
			])
			.run();
		const asOne = await repo.touchpointsOn(asU1, ON_1_NOV);
		expect(asOne.map((t) => t.id)).toEqual(['call', 'private']);
		// The private person is another member's, so they are no participant to this viewer.
		expect(asOne[0]!.participants.map((p) => p.id)).toEqual(['hilde']);
		expect((await repo.touchpointsOn(asU2, ON_1_NOV)).map((t) => t.id)).toEqual(['call']);
	});
});

describe('photosOn', () => {
	it('reads the gallery photos taken on the day in earlier years', async () => {
		seedPhoto('taken', { takenAt: '2024-11-01T15:20:00+01:00' });
		seedPhoto('earlier', { takenAt: '2024-11-01T09:00:00+01:00' });
		seedPhoto('undated', { takenAt: null });
		seedPhoto('other-day', { takenAt: '2024-11-02T09:00:00+01:00' });
		seedPhoto('today', { takenAt: '2026-11-01T08:00:00+01:00' });
		const photos = await repo.photosOn(asU1, ON_1_NOV);
		expect(photos.map((p) => [p.id, p.date])).toEqual([
			['taken', '2024-11-01'],
			['earlier', '2024-11-01']
		]);
		expect(photos[0]).toMatchObject({
			at: Date.parse('2024-11-01T15:20:00+01:00'),
			person: { id: 'hilde' }
		});
	});

	it("leaves out a moment's, a circle's and a cut photo, and another member's private one", async () => {
		const day = { takenAt: '2024-11-01T12:00:00Z' };
		seedEntry('entry', 'hilde', '2024-11-01');
		db.insert(schema.circle)
			.values({ id: 'family', householdId: H, createdBy: U1, name: 'F' })
			.run();
		seedPhoto('gallery', day);
		seedPhoto('of-moment', { ...day, journalEntryId: 'entry' });
		seedPhoto('of-circle', { ...day, circleId: 'family' });
		seedPhoto('cut', { ...day, cutFrom: 'of-circle' });
		seedPhoto('private', { ...day, visibility: 'private' });
		expect((await repo.photosOn(asU1, ON_1_NOV)).map((p) => p.id).toSorted()).toEqual([
			'gallery',
			'private'
		]);
		expect((await repo.photosOn(asU2, ON_1_NOV)).map((p) => p.id)).toEqual(['gallery']);
	});
});
