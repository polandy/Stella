import { and, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { DoneTodo, Todo, TodoRepository } from '../domain/todos/todos';
import type * as schema from './schema';
import { contact, todo } from './schema';

/*
 * Drizzle adapter for the TodoRepository port (docs/08 §8.3). Every read joins the person the
 * to-do is about and is scoped through the central `childRecordVisibleTo`, so a private to-do —
 * or any to-do on a private person — reaches only those allowed to see it (docs/03 §3.7).
 * Writes act on a to-do the use-case has already found through such a read.
 */

const columns = {
	id: todo.id,
	contactId: todo.contactId,
	createdBy: todo.createdBy,
	visibility: todo.visibility,
	title: todo.title,
	dueOn: todo.dueOn,
	doneAt: todo.doneAt,
	doneOn: todo.doneOn,
	doneBy: todo.doneBy,
	createdAt: todo.createdAt,
	updatedAt: todo.updatedAt
};

export function createDrizzleTodoRepository(db: BunSQLiteDatabase<typeof schema>): TodoRepository {
	const visibleOn = (viewer: Viewer, contactId: string) =>
		and(
			eq(todo.contactId, contactId),
			childRecordVisibleTo(viewer, { visibility: todo.visibility, createdBy: todo.createdBy })
		);

	return {
		async insert(t: Todo) {
			db.insert(todo).values(t).run();
		},

		async findVisibleTo(viewer, contactId, todoId) {
			const row = db
				.select(columns)
				.from(todo)
				.innerJoin(contact, eq(todo.contactId, contact.id))
				.where(and(eq(todo.id, todoId), visibleOn(viewer, contactId)))
				.get();
			return row ?? null;
		},

		async update(t: Todo) {
			db.update(todo)
				.set({
					visibility: t.visibility,
					title: t.title,
					dueOn: t.dueOn,
					doneAt: t.doneAt,
					doneOn: t.doneOn,
					doneBy: t.doneBy,
					updatedAt: t.updatedAt
				})
				.where(eq(todo.id, t.id))
				.run();
		},

		async remove(todoId) {
			db.delete(todo).where(eq(todo.id, todoId)).run();
		},

		async listOpenForContactVisibleTo(viewer, contactId) {
			// The card orders them (`orderOpenTodos`): the rule is pure and tested there.
			return db
				.select(columns)
				.from(todo)
				.innerJoin(contact, eq(todo.contactId, contact.id))
				.where(and(visibleOn(viewer, contactId), isNull(todo.doneAt)))
				.all();
		},

		async listStoryPageForContactVisibleTo(viewer, contactId, opts) {
			const conditions = [visibleOn(viewer, contactId), isNotNull(todo.doneOn)];
			if (opts.before) {
				const { doneOn, doneAt } = opts.before;
				// Keyset: strictly older than the cursor in (doneOn, doneAt) order.
				conditions.push(
					or(lt(todo.doneOn, doneOn), and(eq(todo.doneOn, doneOn), lt(todo.doneAt, doneAt)))!
				);
			}
			const rows = db
				.select(columns)
				.from(todo)
				.innerJoin(contact, eq(todo.contactId, contact.id))
				.where(and(...conditions))
				.orderBy(desc(todo.doneOn), desc(todo.doneAt))
				.limit(opts.limit)
				.all();
			// A tick sets both (`domain/todos`); the filter says so to the type.
			return rows.filter((row): row is DoneTodo => row.doneOn !== null && row.doneAt !== null);
		}
	};
}
