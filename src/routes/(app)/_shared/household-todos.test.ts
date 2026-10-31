import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { commandDepsWith } from '$lib/server/domain/testing';
import { TodoGoneError, type HouseholdTodo } from '$lib/server/domain/todos/todos';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { householdTodoActions, householdTodoView } from './household-todos';

/*
 * The household's to-dos beyond one person (docs/02 §2.26): Home's band and `/todos` show them
 * in the card's words and tick them there. Neither has a person in its URL, so the form names
 * them and the access layer checks it, as on the gift list.
 */

const t = createTranslator('en');

const todo: HouseholdTodo = {
	id: 't-1',
	contactId: 'c-1',
	contactName: 'Hilde Brunner',
	avatarPhotoId: 'p-1',
	createdBy: 'u-2',
	visibility: 'shared',
	title: 'Return the cake tin',
	dueOn: '2026-11-02',
	doneAt: null,
	doneOn: null,
	doneBy: null,
	createdAt: 5,
	updatedAt: 5
};
const names = (id: string) => (id === 'u-2' ? 'Sandra Brunner' : null);

describe('householdTodoView', () => {
	it('names the person it is about and who noted it by first name', () => {
		expect(householdTodoView(todo, 'u-1', names)).toEqual({
			id: 't-1',
			contactId: 'c-1',
			contactName: 'Hilde Brunner',
			avatarPhotoId: 'p-1',
			title: 'Return the cake tin',
			dueOn: '2026-11-02',
			visibility: 'shared',
			mine: false,
			notedBy: 'Sandra',
			createdAt: 5
		});
	});

	it('says nothing more of the viewer’s own to-do than that it is theirs', () => {
		expect(householdTodoView(todo, 'u-2', names)).toMatchObject({ mine: true, notedBy: null });
	});
});

const commanding = (handlers: Partial<CommandHandlers>): FakeServices => ({
	offline: { commandDeps: commandDepsWith(handlers) }
});
const actions = householdTodoActions('/todos');
const post = (action: 'tickTodo' | 'untickTodo', services: FakeServices) =>
	answerOf(
		actions[action](
			routeEvent({ services, params: {}, form: formOf({ todoId: 't-1', contactId: 'c-1' }) })
		)
	);

describe('householdTodoActions', () => {
	it('ticks the to-do of the person the form names and returns where it was ticked', async () => {
		const ticked: unknown[] = [];
		const services = commanding({
			'todo.tick': async (_actor, payload) => {
				ticked.push(payload);
				return { todoId: 't-1' };
			}
		});
		expect(await post('tickTodo', services)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/todos'
		});
		expect(ticked).toEqual([{ contactId: 'c-1', todoId: 't-1' }]);
	});

	it('opens it again for *Undo*', async () => {
		const opened: unknown[] = [];
		const services = commanding({
			'todo.untick': async (_actor, payload) => {
				opened.push(payload);
				return { todoId: 't-1' };
			}
		});
		expect(await post('untickTodo', services)).toMatchObject({ kind: 'redirect' });
		expect(opened).toEqual([{ contactId: 'c-1', todoId: 't-1' }]);
	});

	it('answers a tick on a to-do already gone with its reason, for the list’s line', async () => {
		const services = commanding({
			'todo.tick': async () => {
				throw new TodoGoneError();
			}
		});
		expect(await post('tickTodo', services)).toEqual({
			kind: 'fail',
			status: 404,
			data: { todoTickError: t('errors.todo.gone') }
		});
	});
});
