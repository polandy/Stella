import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { toFtsQuery } from '../domain/search/query';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { createDrizzleSearchRepository } from './search-repository';

/*
 * Full search finds to-dos by their title, done ones too and marked so (docs/02 §2.26), within
 * the central visibility scoping (docs/03 §3.7).
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
	ensureSearchIndex(sqlite);

	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{
				id: 'c-hans',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Hans Müller'
			},
			{
				id: 'c-secret',
				householdId: H,
				createdBy: U1,
				visibility: 'private',
				displayName: 'Secretina'
			}
		])
		.run();
	db.insert(schema.todo)
		.values([
			{
				id: 't-open',
				contactId: 'c-hans',
				createdBy: U1,
				title: 'Reifen wechseln',
				dueOn: '2026-11-02'
			},
			{
				id: 't-done',
				contactId: 'c-hans',
				createdBy: U1,
				title: 'Reifen bestellen',
				doneAt: 1,
				doneOn: '2026-10-20',
				doneBy: U1
			},
			{
				id: 't-private',
				contactId: 'c-hans',
				createdBy: U1,
				visibility: 'private',
				title: 'Reifen Geschenk'
			},
			{ id: 't-on-secret', contactId: 'c-secret', createdBy: U1, title: 'Reifen leihen' }
		])
		.run();

	repo = createDrizzleSearchRepository(db);
});

describe('searchTodos', () => {
	it('matches the title and returns the person it is about, the open ones first', async () => {
		const hits = await repo.searchTodos(viewerU1, toFtsQuery('reifen'), 20);
		expect(hits.map((h) => h.todoId).slice(-1)).toEqual(['t-done']);
		expect(hits.find((h) => h.todoId === 't-open')).toEqual({
			todoId: 't-open',
			title: 'Reifen wechseln',
			done: false,
			doneOn: null,
			contactId: 'c-hans',
			contactName: 'Hans Müller'
		});
	});

	it('finds a done one, with the day it was done', async () => {
		const hits = await repo.searchTodos(viewerU1, toFtsQuery('bestellen'), 20);
		expect(hits).toMatchObject([{ todoId: 't-done', done: true, doneOn: '2026-10-20' }]);
	});

	it('finds a private one only for its author, and none on a person the viewer cannot see', async () => {
		const hits = await repo.searchTodos(viewerU2, toFtsQuery('reifen'), 20);
		expect(hits.map((h) => h.todoId).sort()).toEqual(['t-done', 't-open']);
	});

	it('follows an edit and a removal', async () => {
		db.update(schema.todo).set({ title: 'Winterpneus' }).where(eq(schema.todo.id, 't-open')).run();
		expect(
			(await repo.searchTodos(viewerU1, toFtsQuery('winterpneus'), 20)).map((h) => h.todoId)
		).toEqual(['t-open']);
		expect(await repo.searchTodos(viewerU1, toFtsQuery('wechseln'), 20)).toHaveLength(0);

		db.delete(schema.todo).where(eq(schema.todo.id, 't-open')).run();
		expect(await repo.searchTodos(viewerU1, toFtsQuery('winterpneus'), 20)).toHaveLength(0);
	});

	it('goes with the person it is about', async () => {
		db.delete(schema.contact).where(eq(schema.contact.id, 'c-secret')).run();
		expect(await repo.searchTodos(viewerU1, toFtsQuery('leihen'), 20)).toHaveLength(0);
	});
});
