import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewNote } from '../domain/notes/notes';
import * as schema from './schema';
import { createDrizzleNoteRepository } from './note-repository';

/*
 * Integration spec for the Drizzle NoteRepository: child-record visibility scoping
 * (private notes and notes on private contacts), pinned-first ordering (docs/03 §3.7), and the
 * @-mention links a note carries (docs/02 §2.5, §2.20.1).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleNoteRepository>;

function note(over: Partial<NewNote>): NewNote {
	return {
		id: 'n',
		contactId: 'c-shared',
		createdBy: U1,
		visibility: 'shared',
		title: null,
		body: 'body',
		isPinned: false,
		createdAt: 0,
		updatedAt: 0,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values([
		{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
	]).run();
	db.insert(schema.contact).values([
		{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Shared' },
		{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Private' }
	]).run();
	repo = createDrizzleNoteRepository(db);
});

describe('createDrizzleNoteRepository', () => {
	it('inserts and reads a note back with a boolean isPinned', async () => {
		await repo.insert(note({ id: 'n-1', title: 'Hi', body: 'hello', isPinned: true }));
		const list = await repo.listForContactVisibleTo(viewerU1, 'c-shared');
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ id: 'n-1', title: 'Hi', body: 'hello', isPinned: true });
	});

	it('hides a private note from other members but shows it to its author', async () => {
		await repo.insert(note({ id: 'n-priv', visibility: 'private', createdBy: U1 }));
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-shared')).toHaveLength(0);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(1);
	});

	it('hides notes on a private contact from non-owners', async () => {
		await repo.insert(note({ id: 'n-on-priv', contactId: 'c-priv', visibility: 'shared' }));
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-priv')).toHaveLength(0);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});

	it('orders pinned first, then newest', async () => {
		await repo.insert(note({ id: 'a', isPinned: false, createdAt: 100 }));
		await repo.insert(note({ id: 'b', isPinned: true, createdAt: 50 }));
		await repo.insert(note({ id: 'c', isPinned: false, createdAt: 200 }));
		const list = await repo.listForContactVisibleTo(viewerU1, 'c-shared');
		expect(list.map((n) => n.id)).toEqual(['b', 'c', 'a']);
	});
});

describe('note mentions', () => {
	it('stores the referenced people and reads them back', async () => {
		await repo.insert(note({ id: 'n-1' }));
		await repo.replaceMentions('n-1', ['c-priv', 'c-shared']);
		expect((await repo.listMentionedContactIds('n-1')).sort()).toEqual(['c-priv', 'c-shared']);
	});

	it('replaces rather than adds, so an edited body drops the people it no longer names', async () => {
		await repo.insert(note({ id: 'n-1' }));
		await repo.replaceMentions('n-1', ['c-priv', 'c-shared']);
		await repo.replaceMentions('n-1', ['c-shared']);
		expect(await repo.listMentionedContactIds('n-1')).toEqual(['c-shared']);
	});

	it('leaves another note’s links alone', async () => {
		await repo.insert(note({ id: 'n-1' }));
		await repo.insert(note({ id: 'n-2' }));
		await repo.replaceMentions('n-1', ['c-shared']);
		await repo.replaceMentions('n-2', ['c-priv']);
		await repo.replaceMentions('n-1', []);
		expect(await repo.listMentionedContactIds('n-1')).toEqual([]);
		expect(await repo.listMentionedContactIds('n-2')).toEqual(['c-priv']);
	});

	it('lets the links go with the note', async () => {
		await repo.insert(note({ id: 'n-1' }));
		await repo.replaceMentions('n-1', ['c-shared']);
		db.delete(schema.note).where(eq(schema.note.id, 'n-1')).run();
		expect(await repo.listMentionedContactIds('n-1')).toEqual([]);
	});
});
