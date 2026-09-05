import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { createDrizzleAttentionRepository } from './attention-repository';
import * as schema from './schema';

/*
 * Integration spec for the attention adapter (docs/02 §2.12, "Quiet lately"). The rule that
 * needs a real database is the one that decides *which* touches count: only the journal
 * entries and touchpoints the viewer may see. A private entry someone else wrote must not make
 * a person look recently attended to — from that viewer's chair they really are quiet.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

/** Midnight UTC of an ISO day, the shape `contact.created_at` stores. */
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);

let db: BunSQLiteDatabase<typeof schema>;

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
	db.insert(schema.contact)
		.values([
			{ id: 'oma', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Oma', createdAt: ms('2020-01-01') },
			{ id: 'secret', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Secret', createdAt: ms('2020-01-01') }
		])
		.run();
});

const sources = (viewer: Viewer) => createDrizzleAttentionRepository(db).listQuietSourcesVisibleTo(viewer);
const byId = async (viewer: Viewer, id: string) => (await sources(viewer)).find((s) => s.contactId === id);

describe('attention repository, quiet sources', () => {
	it('hands back a person with no story at all, dated from the day they were added', async () => {
		expect(await byId(viewerU1, 'oma')).toEqual({
			contactId: 'oma',
			contactName: 'Oma',
			avatarPhotoId: null,
			isDeceased: false,
			knownSince: '2020-01-01',
			lastTouchedOn: null
		});
	});

	it('takes the latest day across journal entries and touchpoints, whichever is newer', async () => {
		db.insert(schema.journalEntry)
			.values({ id: 'j1', contactId: 'oma', createdBy: U1, visibility: 'shared', entryDate: '2026-08-01', body: 'x' })
			.run();
		db.insert(schema.interaction)
			.values({ id: 'i1', contactId: 'oma', createdBy: U1, visibility: 'shared', kind: 'call', happenedAt: '2026-08-20' })
			.run();

		expect((await byId(viewerU1, 'oma'))!.lastTouchedOn).toBe('2026-08-20');

		db.insert(schema.journalEntry)
			.values({ id: 'j2', contactId: 'oma', createdBy: U1, visibility: 'shared', entryDate: '2026-09-01', body: 'y' })
			.run();

		expect((await byId(viewerU1, 'oma'))!.lastTouchedOn).toBe('2026-09-01');
	});

	it('does not let a private entry the viewer cannot see make a person look attended to', async () => {
		db.insert(schema.journalEntry)
			.values({ id: 'j1', contactId: 'oma', createdBy: U1, visibility: 'private', entryDate: '2026-09-01', body: 'x' })
			.run();

		// The author sees their own private entry; the other household member does not.
		expect((await byId(viewerU1, 'oma'))!.lastTouchedOn).toBe('2026-09-01');
		expect((await byId(viewerU2, 'oma'))!.lastTouchedOn).toBeNull();
	});

	it('lists only the people the viewer may see', async () => {
		expect((await sources(viewerU1)).map((s) => s.contactId).sort()).toEqual(['oma', 'secret']);
		expect((await sources(viewerU2)).map((s) => s.contactId)).toEqual(['oma']);
	});

	it('carries the deceased flag as a boolean, so the domain can leave them out', async () => {
		db.insert(schema.contact)
			.values({ id: 'opa', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Opa', isDeceased: 1 })
			.run();

		expect((await byId(viewerU1, 'opa'))!.isDeceased).toBe(true);
		expect((await byId(viewerU1, 'oma'))!.isDeceased).toBe(false);
	});
});
