import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { PlanGoneError } from '$lib/server/domain/plans/plans';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { planActions as actions } from './plans';

/*
 * The Outings card's actions (docs/dev/02 §2.27), as the edge answers them: every change is a command
 * on the person the URL names, back to their card when it worked. An idea already gone, or kept
 * from the member asking, answers 404 alike, so the answer does not say it is there.
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

const BACK = { kind: 'redirect', status: 303, location: '/contacts/anna#section-plans' } as const;

describe('addPlan', () => {
	it('notes the idea on the person the URL names, with its when and who may see it', async () => {
		const added: unknown[] = [];
		const services = commanding({
			'plan.add': async (_actor, payload) => {
				added.push(payload);
				return { planId: 'p1' };
			}
		});
		const answer = await post('addPlan', services, {
			contactId: 'someone-else',
			title: 'Zoo',
			whenKind: 'in_month',
			whenOn: '2026-12',
			visibility: 'surprise'
		});
		expect(answer).toEqual(BACK);
		expect(added).toEqual([
			{
				contactId: 'anna',
				title: 'Zoo',
				note: null,
				url: null,
				visibility: 'shared',
				hiddenFromPerson: true,
				when: { kind: 'in_month', on: '2026-12' }
			}
		]);
	});

	it('asks for the line when it is left empty, on the card', async () => {
		const answer = await post('addPlan', commanding({}), { title: '', visibility: 'shared' });
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { planError: t('errors.plan.needTitle') }
		});
	});

	it('refuses a when an outing cannot be for', async () => {
		const answer = await post('addPlan', commanding({}), {
			title: 'Zoo',
			whenKind: 'later',
			visibility: 'shared'
		});
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { planError: t('errors.plan.badWhen') }
		});
	});
});

describe('donePlan', () => {
	it('ticks the idea and returns to the card', async () => {
		const done: unknown[] = [];
		const services = commanding({
			'plan.done': async (_actor, payload) => {
				done.push(payload);
				return { planId: 'p1' };
			}
		});
		expect(await post('donePlan', services, { planId: 'p1' })).toEqual(BACK);
		expect(done).toEqual([{ contactId: 'anna', planId: 'p1' }]);
	});
});

describe('bookPlan', () => {
	it('answers 404 for an idea kept from the member, on the card', async () => {
		const services = commanding({
			'plan.book': async () => {
				throw new PlanGoneError();
			}
		});
		expect(await post('bookPlan', services, { planId: 'p1' })).toEqual({
			kind: 'fail',
			status: 404,
			data: { planTickError: t('errors.plan.gone') }
		});
	});
});

describe('removePlan', () => {
	it('answers 404 for an idea already gone, with the reason on its row', async () => {
		const services = commanding({
			'plan.remove': async () => {
				throw new PlanGoneError();
			}
		});
		expect(await post('removePlan', services, { planId: 'p1' })).toEqual({
			kind: 'fail',
			status: 404,
			data: { planRowError: { planId: 'p1', message: t('errors.plan.gone') } }
		});
	});
});

describe('againPlan', () => {
	it('notes a done idea again on the person the URL names', async () => {
		const asked: unknown[] = [];
		const services = commanding({
			'plan.again': async (_actor, payload) => {
				asked.push(payload);
				return { planId: 'p2' };
			}
		});
		expect(await post('againPlan', services, { planId: 'p1', contactId: 'x' })).toEqual(BACK);
		expect(asked).toEqual([{ contactId: 'anna', planId: 'p1' }]);
	});
});
