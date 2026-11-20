import { describe, expect, it } from 'bun:test';
import { createTranslator } from '#lib/i18n/translate.js';
import type { CommandHandlers } from '#lib/server/domain/commands/dispatch.js';
import { commandDepsWith } from '#lib/server/domain/testing/index.js';
import { PlanGoneError } from '#lib/server/domain/plans/plans.js';
import { answerOf, formOf, routeEvent, type FakeServices } from '#lib/server/testing/index.js';
import { applyPlanCommand } from './plan-commands';
import { applyTodoCommand } from './todo-commands';
import { applyGiftCommand } from './gift-commands';

/*
 * The form edge of a command (docs/dev/04 §4.11.2): a field the member got wrong is named in their
 * words; anything else the form posted wrong is *could not read*, never a title that is there.
 */

const t = createTranslator('en');
const back = '/contacts/c-1';

const commanding = (handlers: Partial<CommandHandlers> = {}): FakeServices => ({
	offline: { commandDeps: commandDepsWith(handlers) }
});
const event = (services: FakeServices) => routeEvent<{ locals: App.Locals }>({ services }).locals;

const plan = (payload: Record<string, unknown>, services = commanding()) =>
	answerOf(
		applyPlanCommand(event(services), formOf({}), 'plan.edit', payload, 'planError', {
			contactId: 'c-1',
			back
		})
	);
const idea = { planId: 'p-1', title: 'Rhine falls', visibility: 'shared' };

describe('an outing form', () => {
	it('says a title is missing only when the title is', async () => {
		expect(await plan({ ...idea, title: '' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { planError: t('errors.plan.needTitle') }
		});
	});

	it('names a link that is not text as the link, not as the title', async () => {
		expect(await plan({ ...idea, url: 42 })).toMatchObject({
			data: { planError: t('errors.plan.badLink') }
		});
	});

	it('answers a form that lost which idea it is about as unreadable', async () => {
		expect(await plan({ ...idea, planId: '' })).toMatchObject({
			data: { planError: t('errors.command.malformed') }
		});
	});

	it('answers an idea already gone with 404, so a held remove reads it as done', async () => {
		const services = commanding({
			'plan.edit': async () => {
				throw new PlanGoneError();
			}
		});
		expect(await plan(idea, services)).toEqual({
			kind: 'fail',
			status: 404,
			data: { planError: t('errors.plan.gone') }
		});
	});

	it('goes back where it came from once it worked', async () => {
		const services = commanding({ 'plan.edit': async () => ({ planId: 'p-1' }) });
		expect(await plan(idea, services)).toEqual({ kind: 'redirect', status: 303, location: back });
	});
});

describe('a to-do and a gift form', () => {
	it('keep their own words for their own fields', async () => {
		const todo = await answerOf(
			applyTodoCommand(
				event(commanding()),
				formOf({}),
				'todo.add',
				{ title: '', visibility: 'shared' },
				'todoError',
				{ contactId: 'c-1', back }
			)
		);
		expect(todo).toMatchObject({ data: { todoError: t('errors.todo.needTitle') } });

		const gift = await answerOf(
			applyGiftCommand(
				event(commanding()),
				formOf({}),
				'gift.markGiven',
				{ giftId: 'g-1', givenOn: 'soon' },
				'giftError',
				{ contactId: 'c-1', back }
			)
		);
		expect(gift).toMatchObject({ data: { giftError: t('errors.gift.needDay') } });
	});

	it('say which row a refusal is about', async () => {
		const answer = await answerOf(
			applyTodoCommand(
				event(commanding()),
				formOf({ todoId: 't-1' }),
				'todo.tick',
				{ todoId: '' },
				'todoRowError',
				{ contactId: 'c-1', back }
			)
		);
		expect(answer).toMatchObject({
			data: { todoRowError: { todoId: 't-1', message: t('errors.command.malformed') } }
		});
	});
});
