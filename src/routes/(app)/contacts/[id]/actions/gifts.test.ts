import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { GiftGoneError } from '$lib/server/domain/gifts/gifts';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { giftActions as actions } from './gifts';

/*
 * Removing a gift from its row (docs/dev/02 §2.21), as the edge answers it. The row's remove is
 * held for the undo window and posted later; a 404 tells that post the gift is already gone,
 * which counts as removed (docs/dev/02 §2.23) — any other refusal brings the row back.
 */

const t = createTranslator('en');

const commanding = (handlers: Partial<CommandHandlers>): FakeServices => ({
	offline: { commandDeps: commandDepsWith(handlers) }
});

const remove = (services: FakeServices, giftId = 'g1') =>
	answerOf(
		actions.removeGift(routeEvent({ services, params: { id: 'anna' }, form: formOf({ giftId }) }))
	);

describe('removeGift', () => {
	it('removes the gift and returns to the card', async () => {
		const removed: unknown[] = [];
		const services = commanding({
			'gift.remove': async (_actor, payload) => {
				removed.push(payload);
				return { giftId: 'g1' };
			}
		});
		expect(await remove(services)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna#section-gifts'
		});
		expect(removed).toEqual([{ contactId: 'anna', giftId: 'g1' }]);
	});

	it('answers 404 for a gift already gone, with the reason on its row', async () => {
		const services = commanding({
			'gift.remove': async () => {
				throw new GiftGoneError();
			}
		});
		expect(await remove(services)).toEqual({
			kind: 'fail',
			status: 404,
			data: { giftRowError: { giftId: 'g1', message: t('errors.gift.gone') } }
		});
	});
});

describe('answerGiftWhen', () => {
	const answer = (services: FakeServices, fields: Record<string, string>) =>
		answerOf(
			actions.answerGiftWhen(
				routeEvent({ services, params: { id: 'anna' }, form: formOf({ giftId: 'g1', ...fields }) })
			)
		);
	const answering = (answers: unknown[]) =>
		commanding({
			'gift.answerWhen': async (_actor, payload) => {
				answers.push(payload);
				return { giftId: 'g1' };
			}
		});

	it('keeps the idea as a plain one, or moves it to the when the picker chose', async () => {
		const answers: unknown[] = [];
		const services = answering(answers);
		expect(await answer(services, { whenKind: 'now' })).toMatchObject({ kind: 'redirect' });
		await answer(services, { whenKind: 'at_age', whenAge: '10' });
		expect(answers).toEqual([
			{ contactId: 'anna', giftId: 'g1', when: null },
			{ contactId: 'anna', giftId: 'g1', when: { kind: 'at_age', age: 10 } }
		]);
	});

	it('refuses an answer without any when on its row', async () => {
		expect(await answer(answering([]), {})).toEqual({
			kind: 'fail',
			status: 400,
			data: { giftRowError: { giftId: 'g1', message: t('errors.gift.badWhen') } }
		});
	});
});
