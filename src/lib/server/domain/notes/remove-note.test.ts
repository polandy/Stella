import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Remover } from '../../access/visibility';
import { createDrizzleNoteRepository } from '../../db/note-repository';
import * as schema from '../../db/schema';
import { ensureSearchIndex } from '../../db/search-index';
import { fixedClock, sequentialIds } from '../testing';
import { removeNote } from './remove-note';

/*
 * Removing a note (docs/02 §2.5, docs/03 §3.7): its author always, an admin on a shared one.
 * Wired to the real Drizzle adapter on an in-memory database, because what the removal takes
 * with it — mentions, the search row, the activity entry in the same transaction — lives there.
 */

const H = 'household-1';
const H2 = 'household-2';
const AUTHOR = 'user-nina';
const ADMIN = 'user-andy';
const MEMBER = 'user-mia';
const FOREIGN_ADMIN = 'user-foreign';

const author: Remover = { id: AUTHOR, householdId: H, isAdmin: false };
const admin: Remover = { id: ADMIN, householdId: H, isAdmin: true };
const member: Remover = { id: MEMBER, householdId: H, isAdmin: false };
const foreignAdmin: Remover = { id: FOREIGN_ADMIN, householdId: H2, isAdmin: true };

const NOW = 1_760_000_000_000;

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let deps: Parameters<typeof removeNote>[0];

function addNote(id: string, over: Partial<typeof schema.note.$inferInsert> = {}) {
	db.insert(schema.note)
		.values({ id, contactId: 'c-kurt', createdBy: AUTHOR, visibility: 'shared', body: id, ...over })
		.run();
}

const noteIds = () =>
	db
		.select({ id: schema.note.id })
		.from(schema.note)
		.all()
		.map((r) => r.id);
const activity = () => db.select().from(schema.activityLog).all();
const indexed = (noteId: string) =>
	sqlite.query('SELECT count(*) AS n FROM note_fts WHERE note_id = ?').get(noteId) as { n: number };

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite);
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: H2, name: 'H2' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: AUTHOR, householdId: H, email: 'nina@x.test', name: 'Nina' },
			{ id: ADMIN, householdId: H, email: 'andy@x.test', name: 'Andy', role: 'admin' },
			{ id: MEMBER, householdId: H, email: 'mia@x.test', name: 'Mia' },
			{ id: FOREIGN_ADMIN, householdId: H2, email: 'f@x.test', name: 'F', role: 'admin' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-kurt', householdId: H, createdBy: ADMIN, visibility: 'shared', displayName: 'Kurt' },
			{ id: 'c-lea', householdId: H, createdBy: ADMIN, visibility: 'shared', displayName: 'Lea' },
			{
				id: 'c-secret',
				householdId: H,
				createdBy: ADMIN,
				visibility: 'private',
				displayName: 'Secret'
			}
		])
		.run();
	deps = {
		notes: createDrizzleNoteRepository(db),
		ids: sequentialIds('activity'),
		clock: fixedClock(NOW)
	};
});

describe('removeNote: who may', () => {
	it('lets the author remove their own note, shared or private, and logs nothing', async () => {
		addNote('n-shared');
		addNote('n-private', { visibility: 'private' });

		expect(await removeNote(deps, author, 'n-shared')).toBe(true);
		expect(await removeNote(deps, author, 'n-private')).toBe(true);

		expect(noteIds()).toEqual([]);
		expect(activity()).toEqual([]);
	});

	it("lets an admin remove another member's shared note", async () => {
		addNote('n-shared');
		expect(await removeNote(deps, admin, 'n-shared')).toBe(true);
		expect(noteIds()).toEqual([]);
	});

	it("refuses an admin on another member's private note, and keeps it", async () => {
		addNote('n-private', { visibility: 'private' });
		addNote('n-control');

		expect(await removeNote(deps, admin, 'n-private')).toBe(false);
		expect(await removeNote(deps, admin, 'n-control')).toBe(true);
		expect(noteIds()).toEqual(['n-private']);
	});

	it("refuses a member on someone else's shared note", async () => {
		addNote('n-ninas');
		addNote('n-mias', { createdBy: MEMBER });

		expect(await removeNote(deps, member, 'n-ninas')).toBe(false);
		expect(await removeNote(deps, member, 'n-mias')).toBe(true);
		expect(noteIds()).toEqual(['n-ninas']);
	});

	it('refuses an admin of another household', async () => {
		addNote('n-shared');
		expect(await removeNote(deps, foreignAdmin, 'n-shared')).toBe(false);
		expect(await removeNote(deps, admin, 'n-shared')).toBe(true);
	});

	it('answers a note that is gone like one the remover may not touch, logging nothing', async () => {
		expect(await removeNote(deps, admin, 'n-never')).toBe(false);
		addNote('n-once');
		expect(await removeNote(deps, author, 'n-once')).toBe(true);
		expect(await removeNote(deps, author, 'n-once')).toBe(false);
		expect(activity()).toEqual([]);
	});
});

describe('removeNote: what goes with it', () => {
	it('takes its mentions and its search row along', async () => {
		addNote('n-mentions', { body: 'Coffee with Lea' });
		db.insert(schema.noteMention).values({ noteId: 'n-mentions', contactId: 'c-lea' }).run();
		expect(indexed('n-mentions').n).toBe(1);

		await removeNote(deps, author, 'n-mentions');

		expect(db.select().from(schema.noteMention).all()).toEqual([]);
		expect(indexed('n-mentions').n).toBe(0);
	});

	it("logs an admin's removal once, shared, naming kind, person and both members — never the text", async () => {
		addNote('n-shared', { title: 'Secret plans', body: 'The surprise party' });

		await removeNote(deps, admin, 'n-shared');

		const [entry, ...more] = activity();
		expect(more).toEqual([]);
		expect(entry).toMatchObject({
			householdId: H,
			actorId: ADMIN,
			action: 'delete',
			entityType: 'note',
			entityId: 'n-shared',
			contactId: 'c-kurt',
			visibility: 'shared',
			createdAt: NOW
		});
		expect(JSON.parse(entry!.summary)).toEqual({
			person: 'Kurt',
			authorId: AUTHOR,
			authorName: 'Nina'
		});
		expect(entry!.summary).not.toContain('Secret plans');
		expect(entry!.summary).not.toContain('surprise');
	});

	it('keeps the entry as private as the person when the person is private', async () => {
		addNote('n-on-secret', { contactId: 'c-secret' });

		await removeNote(deps, admin, 'n-on-secret');

		expect(activity().map((a) => a.visibility)).toEqual(['private']);
	});

	it('writes no entry when the delete is refused', async () => {
		addNote('n-ninas');
		await removeNote(deps, member, 'n-ninas');
		expect(activity()).toEqual([]);
	});

	it('writes the entry in the same transaction as the delete', async () => {
		addNote('n-shared');
		// The log row cannot be written: the delete must not stand on its own.
		sqlite.exec(
			"CREATE TRIGGER no_log BEFORE INSERT ON activity_log BEGIN SELECT RAISE(ABORT, 'no log'); END"
		);

		await expect(removeNote(deps, admin, 'n-shared')).rejects.toThrow('no log');
		expect(noteIds()).toEqual(['n-shared']);
	});
});
