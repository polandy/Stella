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
 * docs/03 §3.7), that the card's list holds only what is open, and that the story's page holds
 * only what is done, in story order, resuming strictly after its cursor.
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
		doneOn: null,
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
		await repo.insert(todo({ id: 'done', doneAt: 9, doneOn: '2026-10-30', doneBy: U2 }));
		const open = await repo.listOpenForContactVisibleTo(viewerU1, 'c-shared');
		expect(open.map((t) => t.id)).toEqual(['open']);
	});

	it('stores a tick, a rewrite and a removal', async () => {
		await repo.insert(todo({ id: 't-1' }));
		await repo.update(
			todo({
				id: 't-1',
				title: 'Cookbook',
				dueOn: '2026-11-08',
				doneAt: 9,
				doneOn: '2026-10-30',
				doneBy: U2,
				updatedAt: 9
			})
		);
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 't-1')).toMatchObject({
			title: 'Cookbook',
			dueOn: '2026-11-08',
			doneAt: 9,
			doneOn: '2026-10-30',
			doneBy: U2,
			updatedAt: 9
		});
		await repo.remove('t-1');
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 't-1')).toBeNull();
	});

	describe('the story page', () => {
		const done = (id: string, doneOn: string, doneAt: number, over: Partial<Todo> = {}) =>
			todo({ id, doneOn, doneAt, doneBy: U2, ...over });

		it('lists the done ones only, newest day first, then the later tick', async () => {
			await repo.insert(todo({ id: 'open' }));
			await repo.insert(done('old', '2026-10-01', 50));
			await repo.insert(done('early', '2026-10-20', 10));
			await repo.insert(done('late', '2026-10-20', 20));
			const page = await repo.listStoryPageForContactVisibleTo(viewerU1, 'c-shared', { limit: 10 });
			expect(page.map((t) => t.id)).toEqual(['late', 'early', 'old']);
		});

		it('resumes strictly after the cursor and stops at the limit', async () => {
			await repo.insert(done('a', '2026-10-20', 20));
			await repo.insert(done('b', '2026-10-20', 10));
			await repo.insert(done('c', '2026-10-19', 30));
			const page = await repo.listStoryPageForContactVisibleTo(viewerU1, 'c-shared', {
				limit: 1,
				before: { doneOn: '2026-10-20', doneAt: 20 }
			});
			expect(page.map((t) => t.id)).toEqual(['b']);
		});

		it('keeps a private one to its author and a private person to its creator', async () => {
			await repo.insert(done('mine', '2026-10-20', 20, { visibility: 'private' }));
			await repo.insert(done('hidden', '2026-10-20', 20, { contactId: 'c-priv' }));
			expect(
				await repo.listStoryPageForContactVisibleTo(viewerU2, 'c-shared', { limit: 10 })
			).toEqual([]);
			expect(
				await repo.listStoryPageForContactVisibleTo(viewerU2, 'c-priv', { limit: 10 })
			).toEqual([]);
			expect(
				await repo.listStoryPageForContactVisibleTo(viewerU1, 'c-shared', { limit: 10 })
			).toHaveLength(1);
		});
	});
});
