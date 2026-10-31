import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { Todo } from '../domain/todos/todos';
import { createDrizzleTodoRepository } from './todo-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle TodoRepository (docs/02 §2.26): child-record visibility (a
 * private to-do reaches only its author, one on a private person only that person's creator —
 * docs/03 §3.7), and that the card's list holds only what is open.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleTodoRepository>;

function todo(over: Partial<Todo>): Todo {
	return {
		id: 't',
		contactId: 'c-shared',
		createdBy: U1,
		visibility: 'shared',
		title: 'Give the book back',
		dueOn: null,
		doneAt: null,
		doneBy: null,
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
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'S' },
			{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'P' }
		])
		.run();
	repo = createDrizzleTodoRepository(db);
});

describe('createDrizzleTodoRepository', () => {
	it('reads a to-do back as it was stored', async () => {
		const stored = todo({ id: 't-1', dueOn: '2026-11-08', createdAt: 5, updatedAt: 6 });
		await repo.insert(stored);
		expect(await repo.findVisibleTo(viewerU2, 'c-shared', 't-1')).toEqual(stored);
	});

	it('finds a to-do only on the person it belongs to', async () => {
		await repo.insert(todo({ id: 't-1' }));
		expect(await repo.findVisibleTo(viewerU1, 'c-priv', 't-1')).toBeNull();
	});

	it('shows a private to-do to its author only', async () => {
		await repo.insert(todo({ id: 't-1', visibility: 'private' }));
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 't-1')).not.toBeNull();
		expect(await repo.findVisibleTo(viewerU2, 'c-shared', 't-1')).toBeNull();
		expect(await repo.listOpenForContactVisibleTo(viewerU2, 'c-shared')).toEqual([]);
	});

	it('shows nothing on a person the viewer cannot see', async () => {
		await repo.insert(todo({ id: 't-1', contactId: 'c-priv' }));
		expect(await repo.findVisibleTo(viewerU2, 'c-priv', 't-1')).toBeNull();
		expect(await repo.listOpenForContactVisibleTo(viewerU2, 'c-priv')).toEqual([]);
		expect(await repo.listOpenForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});

	it('lists only the open ones', async () => {
		await repo.insert(todo({ id: 'open' }));
		await repo.insert(todo({ id: 'done', doneAt: 9, doneBy: U2 }));
		const open = await repo.listOpenForContactVisibleTo(viewerU1, 'c-shared');
		expect(open.map((t) => t.id)).toEqual(['open']);
	});

	it('stores a tick, a rewrite and a removal', async () => {
		await repo.insert(todo({ id: 't-1' }));
		await repo.update(
			todo({ id: 't-1', title: 'Cookbook', dueOn: '2026-11-08', doneAt: 9, doneBy: U2, updatedAt: 9 })
		);
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 't-1')).toMatchObject({
			title: 'Cookbook',
			dueOn: '2026-11-08',
			doneAt: 9,
			doneBy: U2,
			updatedAt: 9
		});
		await repo.remove('t-1');
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 't-1')).toBeNull();
	});
});
