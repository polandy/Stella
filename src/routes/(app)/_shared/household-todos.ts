import { fromFormData } from '$lib/commands/form-data';
import { TodoRefSchema } from '$lib/commands/payloads';
import { requireViewer } from '$lib/server/auth/guards';
import { authorNames } from '$lib/server/domain/household/members';
import { listOpenTodos, type HouseholdTodo } from '$lib/server/domain/todos/todos';
import { authorLabel } from '$lib/story/author';
import type { HouseholdTodoView } from '$lib/todos/household';
import { orderOpenTodos } from '$lib/todos/todos';
import type { RequestEvent } from '@sveltejs/kit';
import { applyTodoCommand, type TodoCommand, type TodoErrorKey } from './todo-commands';

/*
 * The household's to-dos beyond one person (docs/02 §2.26.6): Home's *To do* band and `/todos`
 * read the same rows and tick them the same way. Neither has a person in its URL, so the form
 * names them and the access layer checks it, as on the gift list (§2.25.6). Rewriting and
 * removing a to-do stay on the person's card.
 */

/** An open to-do in the card's words, with the person it is about. */
export function householdTodoView(
	todo: HouseholdTodo,
	viewerId: string,
	nameOfAuthor: (userId: string) => string | null
): HouseholdTodoView {
	const mine = todo.createdBy === viewerId;
	return {
		id: todo.id,
		contactId: todo.contactId,
		contactName: todo.contactName,
		avatarPhotoId: todo.avatarPhotoId,
		title: todo.title,
		dueOn: todo.dueOn,
		visibility: todo.visibility,
		mine,
		notedBy: mine ? null : authorLabel(false, nameOfAuthor(todo.createdBy)),
		createdAt: todo.createdAt
	};
}

/** Every open to-do the reader may see, in the card's order. */
export async function readHouseholdTodos(
	locals: RequestEvent['locals']
): Promise<HouseholdTodoView[]> {
	const viewer = requireViewer(locals);
	const [todos, nameOfAuthor] = await Promise.all([
		listOpenTodos(locals.services.todos.todoDeps, viewer),
		authorNames(locals.services.household.memberDeps, viewer.householdId)
	]);
	return orderOpenTodos(todos).map((todo) => householdTodoView(todo, viewer.id, nameOfAuthor));
}

/** Ticking and *Undo* on a page that lists several people's to-dos, back to `back`. */
export function householdTodoActions(back: string) {
	const onRow =
		(type: TodoCommand, errorKey: TodoErrorKey) =>
		async ({ request, locals }: Pick<RequestEvent, 'request' | 'locals'>) => {
			const form = await request.formData();
			const contactId = form.get('contactId');
			return applyTodoCommand(locals, form, type, fromFormData(TodoRefSchema, form), errorKey, {
				contactId: typeof contactId === 'string' ? contactId : '',
				back
			});
		};
	return {
		tickTodo: onRow('todo.tick', 'todoTickError'),
		untickTodo: onRow('todo.untick', 'todoTickError')
	};
}
