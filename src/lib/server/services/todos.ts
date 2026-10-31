import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleTodoRepository } from '../db/todo-repository';
import type * as schema from '../db/schema';
import type { TodoDeps } from '../domain/todos/todos';
import type { IdGenerator } from '../id';

/*
 * The `todos` bounded context of the composition root (docs/08 §8.3): what the household still
 * owes a person (docs/02 §2.26). Built once per process by `createServices`; the edge reads it
 * off `locals.services.todos`.
 */
export interface TodoServices {
	todoDeps: TodoDeps;
}

export interface TodoWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** Whom a to-do may be noted on; the people context owns the repository. */
	contacts: TodoDeps['contacts'];
}

export function createTodoServices({ db, clock, ids, contacts }: TodoWiring): TodoServices {
	return { todoDeps: { todos: createDrizzleTodoRepository(db), contacts, ids, clock } };
}
