import { fromFormData } from '$lib/commands/form-data';
import { TodoAddSchema, TodoEditSchema, TodoRefSchema } from '$lib/commands/payloads';
import { contactSectionPath } from '$lib/people/sections';
import type { RequestEvent } from '@sveltejs/kit';
import {
	applyTodoCommand,
	type TodoCommand,
	type TodoErrorKey
} from '../../../_shared/todo-commands';
import type { Actions } from '../$types';

/*
 * The To do card (docs/02 §2.26). Every change is a command (docs/04 §4.11.2): noting and
 * ticking a to-do may wait on a phone like any addition; rewriting, reopening and removing one
 * go straight to Stella.
 */

/** One to-do command on the person the URL names, back to their To do card when it worked. */
const onCard = async (
	{
		params,
		locals,
		request
	}: Pick<RequestEvent, 'locals' | 'request'> & { params: { id: string } },
	type: TodoCommand,
	payloadOf: (form: FormData) => Record<string, unknown>,
	errorKey: TodoErrorKey
) => {
	const form = await request.formData();
	return applyTodoCommand(locals, form, type, payloadOf(form), errorKey, {
		contactId: params.id,
		back: contactSectionPath(params.id, 'todos')
	});
};

const ref = (form: FormData) => fromFormData(TodoRefSchema, form);

export const todoActions = {
	addTodo: (event) =>
		onCard(event, 'todo.add', (form) => fromFormData(TodoAddSchema, form), 'todoError'),
	editTodo: (event) =>
		onCard(event, 'todo.edit', (form) => fromFormData(TodoEditSchema, form), 'todoRowError'),
	tickTodo: (event) => onCard(event, 'todo.tick', ref, 'todoTickError'),
	untickTodo: (event) => onCard(event, 'todo.untick', ref, 'todoRowError'),
	removeTodo: (event) => onCard(event, 'todo.remove', ref, 'todoRowError')
} satisfies Actions;
