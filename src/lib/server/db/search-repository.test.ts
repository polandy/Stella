import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { toFtsQuery } from '../domain/search/query';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { createDrizzleSearchRepository } from './search-repository';

/*
 * Integration spec for FTS search: matching via the triggers-maintained index plus the
 * central visibility scoping (private contacts/notes must not leak, docs/02 §2.9, §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSearchRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite); // create FTS + triggers before inserts

	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values([
		{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
	]).run();
	db.insert(schema.contact).values([
		{ id: 'c-hans', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Hans Müller' },
		{ id: 'c-secret', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Secretina' }
	]).run();
	db.insert(schema.note).values([
		{ id: 'n-shared', contactId: 'c-hans', createdBy: U1, visibility: 'shared', body: 'Met at the lake' },
		{ id: 'n-priv', contactId: 'c-hans', createdBy: U1, visibility: 'private', body: 'secret lake meeting' }
	]).run();

	repo = createDrizzleSearchRepository(db);
});

describe('searchContacts', () => {
	it('matches contacts by a prefix query', async () => {
		const hits = await repo.searchContacts(viewerU1, toFtsQuery('hans'), 20);
		expect(hits.map((h) => h.id)).toEqual(['c-hans']);
	});

	it('does not leak a private contact to other members', async () => {
		expect(await repo.searchContacts(viewerU2, toFtsQuery('secretina'), 20)).toHaveLength(0);
		expect(await repo.searchContacts(viewerU1, toFtsQuery('secretina'), 20)).toHaveLength(1);
	});
});

describe('searchNotes', () => {
	it('matches note bodies and returns the contact context', async () => {
		const hits = await repo.searchNotes(viewerU1, toFtsQuery('lake'), 20);
		expect(hits.map((h) => h.noteId).sort()).toEqual(['n-priv', 'n-shared']);
		expect(hits.find((h) => h.noteId === 'n-shared')?.contactName).toBe('Hans Müller');
	});

	it('hides a private note from other members', async () => {
		const hits = await repo.searchNotes(viewerU2, toFtsQuery('lake'), 20);
		expect(hits.map((h) => h.noteId)).toEqual(['n-shared']);
	});
});
