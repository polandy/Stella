import { beforeEach, describe, expect, it } from 'bun:test';
import { inEnglish } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import { ContactGoneError } from '../contacts/require-visible';
import {
	addTodo,
	editTodo,
	InvalidTodoError,
	listOpenTodosForContact,
	removeTodo,
	tickTodo,
	TodoGoneError,
	untickTodo,
	type Todo,
	type TodoDeps,
	type TodoRepository
} from './todos';

/*
 * The to-do use-cases (docs/02 §2.26), over an in-memory port. What the database scopes — a
 * private to-do reaching only its author, one on a person the viewer cannot see — is the
 * Drizzle adapter's to prove (`db/todo-repository.test.ts`); the fake keeps the same rule.
 */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const HILDE = 'hilde';

function fakeTodos(): TodoRepository & { rows: Map<string, Todo> } {
	const rows = new Map<string, Todo>();
	const visible = (viewer: Viewer, todo: Todo) =>
		todo.visibility === 'shared' || todo.createdBy === viewer.id;
	return {
		rows,
		async insert(todo) {
			rows.set(todo.id, { ...todo });
		},
		async findVisibleTo(viewer, contactId, todoId) {
			const todo = rows.get(todoId);
			return todo && todo.contactId === contactId && visible(viewer, todo) ? { ...todo } : null;
		},
		async update(todo) {
			rows.set(todo.id, { ...todo });
		},
		async remove(todoId) {
			rows.delete(todoId);
		},
		async listOpenForContactVisibleTo(viewer, contactId) {
			return [...rows.values()].filter(
				(t) => t.contactId === contactId && t.doneAt === null && visible(viewer, t)
			);
		}
	};
}

let todos: ReturnType<typeof fakeTodos>;
let deps: TodoDeps;
let now: number;
let counter: number;

beforeEach(() => {
	todos = fakeTodos();
	now = Date.UTC(2026, 9, 31, 9);
	counter = 0;
	deps = {
		todos,
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				return id === HILDE ? ({ id } as never) : null;
			}
		},
		ids: { next: () => `todo-${++counter}` },
		clock: { now: () => now }
	};
});

const book = (title = 'Give the book back') => ({
	contactId: HILDE,
	title,
	dueOn: null,
	visibility: 'shared' as const
});

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidTodoError || error instanceof TodoGoneError)
			return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('addTodo', () => {
	it('notes an open to-do with only a line, by its author, shared', async () => {
		const { todoId } = await addTodo(deps, ANDY, book('  Give the book back  '));
		expect(todos.rows.get(todoId)).toEqual({
			id: todoId,
			contactId: HILDE,
			createdBy: 'andy',
			visibility: 'shared',
			title: 'Give the book back',
			dueOn: null,
			doneAt: null,
			doneBy: null,
			createdAt: now,
			updatedAt: now
		});
	});

	it('keeps the day it is due by', async () => {
		const { todoId } = await addTodo(deps, ANDY, { ...book(), dueOn: '2026-11-08' });
		expect(todos.rows.get(todoId)?.dueOn).toBe('2026-11-08');
	});

	it('takes an empty day as none', async () => {
		const { todoId } = await addTodo(deps, ANDY, { ...book(), dueOn: '  ' });
		expect(todos.rows.get(todoId)?.dueOn).toBeNull();
	});

	it('refuses an empty line and a day that does not exist', async () => {
		expect(await refusal(addTodo(deps, ANDY, book('   ')))).toBe('Write what needs doing.');
		expect(await refusal(addTodo(deps, ANDY, { ...book(), dueOn: '2026-02-30' }))).toBe(
			'There is no 2026-02-30.'
		);
		expect(await refusal(addTodo(deps, ANDY, { ...book(), dueOn: 'soon' }))).toBe(
			'Please choose the day.'
		);
	});

	it('refuses a person the author cannot see', async () => {
		expect(addTodo(deps, ANDY, { ...book(), contactId: 'nobody' })).rejects.toBeInstanceOf(
			ContactGoneError
		);
	});
});

describe('editTodo', () => {
	it('lets anyone who sees it rewrite the line and the day', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		now += 1000;
		await editTodo(deps, JULIA, {
			contactId: HILDE,
			todoId,
			title: 'Give the cookbook back',
			dueOn: '2026-11-08',
			visibility: 'shared'
		});
		expect(todos.rows.get(todoId)).toMatchObject({
			title: 'Give the cookbook back',
			dueOn: '2026-11-08',
			createdBy: 'andy',
			updatedAt: now
		});
	});

	it('lets only the author make it private', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		await editTodo(deps, JULIA, { ...book(), todoId, visibility: 'private' });
		expect(todos.rows.get(todoId)?.visibility).toBe('shared');
		await editTodo(deps, ANDY, { ...book(), todoId, visibility: 'private' });
		expect(todos.rows.get(todoId)?.visibility).toBe('private');
	});

	it('refuses a to-do the member cannot see', async () => {
		const { todoId } = await addTodo(deps, ANDY, { ...book(), visibility: 'private' });
		expect(await refusal(editTodo(deps, JULIA, { ...book(), todoId }))).toBe(
			'This to-do is no longer there.'
		);
	});
});

describe('tickTodo and untickTodo', () => {
	it('marks it done, by whom and when, and takes it off the open list', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		now += 60_000;
		await tickTodo(deps, JULIA, { contactId: HILDE, todoId });
		expect(todos.rows.get(todoId)).toMatchObject({ doneAt: now, doneBy: 'julia' });
		expect(await listOpenTodosForContact(deps, { id: 'andy', householdId: 'h1' }, HILDE)).toEqual(
			[]
		);
	});

	it('leaves a to-do already done as it was: a replayed tick changes nothing', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		await tickTodo(deps, ANDY, { contactId: HILDE, todoId });
		const first = todos.rows.get(todoId);
		now += 60_000;
		await tickTodo(deps, JULIA, { contactId: HILDE, todoId });
		expect(todos.rows.get(todoId)).toEqual(first!);
	});

	it('opens it again', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		await tickTodo(deps, ANDY, { contactId: HILDE, todoId });
		await untickTodo(deps, JULIA, { contactId: HILDE, todoId });
		expect(todos.rows.get(todoId)).toMatchObject({ doneAt: null, doneBy: null });
	});

	it('refuses to tick a to-do that is gone', async () => {
		expect(await refusal(tickTodo(deps, ANDY, { contactId: HILDE, todoId: 'gone' }))).toBe(
			'This to-do is no longer there.'
		);
	});
});

describe('removeTodo', () => {
	it('lets anyone who sees it remove it', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		await removeTodo(deps, JULIA, { contactId: HILDE, todoId });
		expect(todos.rows.has(todoId)).toBe(false);
	});

	it('refuses one on another person', async () => {
		const { todoId } = await addTodo(deps, ANDY, book());
		expect(await refusal(removeTodo(deps, ANDY, { contactId: 'rosa', todoId }))).toBe(
			'This to-do is no longer there.'
		);
	});
});
