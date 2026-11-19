import type { CommandType } from '$lib/commands/commands';
import { TodoGoneError } from '$lib/server/domain/todos/todos';
import { fail, type RequestEvent } from '@sveltejs/kit';
import {
	applyCommandFromForm,
	textOf,
	type CommandFormEdge,
	type CommandFormTarget
} from './command-form';

/*
 * A to-do changed from a form (docs/dev/02 §2.26). The person's To-dos card and the household's
 * list of every open to-do post these commands (docs/dev/04 §4.11.2) and answer the same way.
 */

export type TodoCommand = Extract<CommandType, `todo.${string}`>;

/**
 * Where a refusal is shown: the add form's, a row's (which says which to-do), or the card's own
 * line for a tick, which has no form to keep open.
 */
export type TodoErrorKey = 'todoError' | 'todoRowError' | 'todoTickError';

/** Which field names which mistake. */
const TODO_FORM: CommandFormEdge = {
	fieldErrors: {
		title: 'errors.todo.needTitle',
		dueOn: 'errors.todo.needDay'
	},
	couldNotSave: 'errors.todo.couldNotSave',
	isGone: (error) => error instanceof TodoGoneError
};

/** Whose to-do it is, and where the member lands once it worked. */
export type TodoTarget = CommandFormTarget;

/**
 * Apply one to-do command for the member and answer as the form expects: back to `target.back`
 * when it worked, its reason under `errorKey` when it was refused.
 */
export async function applyTodoCommand(
	locals: RequestEvent['locals'],
	form: FormData,
	type: TodoCommand,
	payload: Record<string, unknown>,
	errorKey: TodoErrorKey,
	target: TodoTarget
) {
	const todoId = textOf(form, 'todoId');
	// A row's error is shown on its row, so it says which to-do it is about.
	const failure = (message: string, status: number) =>
		fail(
			status,
			errorKey === 'todoRowError'
				? { todoRowError: { todoId, message } }
				: errorKey === 'todoTickError'
					? { todoTickError: message }
					: { todoError: message }
		);
	return applyCommandFromForm(locals, form, type, payload, TODO_FORM, target, failure);
}
