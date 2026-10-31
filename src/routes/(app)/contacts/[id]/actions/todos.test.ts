import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { TodoGoneError } from '$lib/server/domain/todos/todos';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { todoActions as actions } from './todos';

/*
 * The To do card's actions (docs/02 §2.26), as the edge answers them: every change is a command
 * on the person the URL names, back to their card when it worked. A to-do already gone answers
 * 404, which a held remove reads as done (docs/02 §2.23).
 */

const t = createTranslator('en');

const commanding = (handlers: Partial<CommandHandlers>): FakeServices => ({
	offline: { commandDeps: commandDepsWith(handlers) }
});

const post = (
	action: keyof typeof actions,
	services: FakeServices,
	fields: Record<string, string>
) =>
	answerOf(actions[action](routeEvent({ services, params: { id: 'anna' }, form: formOf(fields) })));

const BACK = { kind: 'redirect', status: 303, location: '/contacts/anna#section-todos' } as const;

describe('addTodo', () => {
	it('notes the to-do on the person the URL names, whatever the form says', async () => {
		const added: unknown[] = [];
		const services = commanding({
			'todo.add': async (_actor, payload) => {
				added.push(payload);
				return { todoId: 't1' };
			}
		});
		const answer = await post('addTodo', services, {
			contactId: 'someone-else',
			title: 'Give the book back',
			dueOn: '2026-11-08',
			visibility: 'private'
		});
		expect(answer).toEqual(BACK);
		expect(added).toEqual([
			{
				contactId: 'anna',
				title: 'Give the book back',
				dueOn: '2026-11-08',
				visibility: 'private'
			}
		]);
	});

	it('asks for the line when it is left empty, on the card', async () => {
		const answer = await post('addTodo', commanding({}), { title: '', visibility: 'shared' });
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { todoError: t('errors.todo.needTitle') }
		});
	});
});

describe('tickTodo', () => {
	it('ticks the to-do and returns to the card', async () => {
		const ticked: unknown[] = [];
		const services = commanding({
			'todo.tick': async (_actor, payload) => {
				ticked.push(payload);
				return { todoId: 't1' };
			}
		});
		expect(await post('tickTodo', services, { todoId: 't1' })).toEqual(BACK);
		expect(ticked).toEqual([{ contactId: 'anna', todoId: 't1' }]);
	});
});

describe('removeTodo', () => {
	it('answers 404 for a to-do already gone, with the reason on its row', async () => {
		const services = commanding({
			'todo.remove': async () => {
				throw new TodoGoneError();
			}
		});
		expect(await post('removeTodo', services, { todoId: 't1' })).toEqual({
			kind: 'fail',
			status: 404,
			data: { todoRowError: { todoId: 't1', message: t('errors.todo.gone') } }
		});
	});
});
