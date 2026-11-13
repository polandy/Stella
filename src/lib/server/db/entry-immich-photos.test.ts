import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import {
	createDrizzleEntryImmichPhotoReads,
	createDrizzleOwnEntryImmichPhotos
} from './entry-immich-photos';
import { setEntrySubjects } from './journal-subjects';
import * as schema from './schema';

/* An entry's Immich references as its author edits them and its readers see them (docs/02 §2.20). */

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';

let db: BunSQLiteDatabase<typeof schema>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: 'h', name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: 'u1', householdId: 'h', email: 'a@x.test', name: 'A' },
			{ id: 'u2', householdId: 'h', email: 'b@x.test', name: 'B' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c', householdId: 'h', createdBy: 'u1', displayName: 'C' },
			{ id: 'd', householdId: 'h', createdBy: 'u1', displayName: 'D', visibility: 'private' }
		])
		.run();
	const entry = { subjectKey: 'c', entryDate: '2026-09-27', body: 'x' };
	db.insert(schema.journalEntry)
		.values([
			{ ...entry, id: 'e1', contactId: 'c', createdBy: 'u1' },
			{ ...entry, id: 'e2', contactId: 'c', createdBy: 'u1', visibility: 'private' },
			{ ...entry, id: 'e3', contactId: 'c', createdBy: 'u2' },
			{ ...entry, id: 'e4', contactId: 'd', subjectKey: 'd', createdBy: 'u1' }
		])
		.run();
});

const refs = () =>
	db
		.select({
			entry: schema.journalImmichPhoto.journalEntryId,
			asset: schema.journalImmichPhoto.assetId
		})
		.from(schema.journalImmichPhoto)
		.all();

describe('own entry Immich references', () => {
	it('links to the author’s own entry once per photo, and never to someone else’s', async () => {
		const own = createDrizzleOwnEntryImmichPhotos(db);

		expect(await own.linkOwn('u1', 'e1', [A1, A2])).toBe(true);
		expect(await own.linkOwn('u1', 'e1', [A1])).toBe(true);
		expect(await own.linkOwn('u1', 'e3', [A1])).toBe(false);
		expect(await own.linkOwn('u1', 'gone', [A1])).toBe(false);

		expect(refs()).toEqual([
			{ entry: 'e1', asset: A1 },
			{ entry: 'e1', asset: A2 }
		]);
	});

	it('unlinks only off the author’s own entry', async () => {
		const own = createDrizzleOwnEntryImmichPhotos(db);
		await own.linkOwn('u1', 'e1', [A1]);
		await own.linkOwn('u2', 'e3', [A1]);

		expect(await own.unlinkOwn('u1', 'e3', A1)).toBe(false);
		expect(await own.unlinkOwn('u1', 'e1', A2)).toBe(false);
		expect(await own.unlinkOwn('u1', 'e1', A1)).toBe(true);
		expect(refs()).toEqual([{ entry: 'e3', asset: A1 }]);
	});

	it('goes with its entry, and follows it when two entries are joined', async () => {
		const own = createDrizzleOwnEntryImmichPhotos(db);
		await own.linkOwn('u1', 'e1', [A1]);
		await own.linkOwn('u1', 'e4', [A1, A2]);

		// e4 about C becomes e1's slot: joined into e1, the duplicate reference collapses.
		const kept = db.transaction((tx) => setEntrySubjects(tx, 'e4', ['c'], 1));
		expect(kept).toBe('e1');
		expect(refs().sort((a, b) => a.asset.localeCompare(b.asset))).toEqual([
			{ entry: 'e1', asset: A1 },
			{ entry: 'e1', asset: A2 }
		]);

		db.delete(schema.journalEntry).where(eq(schema.journalEntry.id, 'e1')).run();
		expect(refs()).toEqual([]);
	});
});

describe('readable Immich references', () => {
	it('answers only the entries asked for that the reader may see', async () => {
		const own = createDrizzleOwnEntryImmichPhotos(db);
		await own.linkOwn('u1', 'e1', [A2, A1]);
		await own.linkOwn('u1', 'e2', [A1]);
		await own.linkOwn('u2', 'e3', [A1]);
		await own.linkOwn('u1', 'e4', [A1]);
		const reads = createDrizzleEntryImmichPhotoReads(db);
		const all = ['e1', 'e2', 'e3', 'e4'];

		// u2 sees neither u1's private entry nor the private person's.
		expect(await reads.listOfEntries({ id: 'u2', householdId: 'h' }, 'c', all)).toEqual([
			{ journalEntryId: 'e1', assetId: A2 },
			{ journalEntryId: 'e1', assetId: A1 },
			{ journalEntryId: 'e3', assetId: A1 }
		]);
		expect(await reads.listOfEntries({ id: 'u2', householdId: 'h' }, 'd', all)).toEqual([]);
		expect(await reads.listOfEntries({ id: 'u1', householdId: 'h' }, 'c', ['e2'])).toEqual([
			{ journalEntryId: 'e2', assetId: A1 }
		]);
		expect(await reads.listOfEntries({ id: 'u1', householdId: 'other' }, 'c', all)).toEqual([]);
		expect(await reads.listOfEntries({ id: 'u1', householdId: 'h' }, 'c', [])).toEqual([]);
	});
});
