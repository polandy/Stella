import { describe, expect, it } from 'bun:test';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent } from '$lib/server/testing';
import { actions } from './+page.server';

/* A tick on `/todos` (docs/02 §2.26.6) names its person in the form and returns to the list. */

describe('tickTodo on the list', () => {
	it('ticks the to-do of the person the form names and returns to /todos', async () => {
		const ticked: unknown[] = [];
		const services = {
			offline: {
				commandDeps: commandDepsWith({
					'todo.tick': async (_actor, payload) => {
						ticked.push(payload);
						return { todoId: 't-1' };
					}
				})
			}
		};
		const answer = await answerOf(
			actions.tickTodo(
				routeEvent({ services, params: {}, form: formOf({ todoId: 't-1', contactId: 'c-1' }) })
			)
		);
		expect(answer).toEqual({ kind: 'redirect', status: 303, location: '/todos' });
		expect(ticked).toEqual([{ contactId: 'c-1', todoId: 't-1' }]);
	});
});
