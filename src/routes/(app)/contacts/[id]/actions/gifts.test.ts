import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { GiftGoneError } from '$lib/server/domain/gifts/gifts';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { giftActions as actions } from './gifts';

/*
 * Removing a gift from its row (docs/02 §2.21), as the edge answers it. The row's remove is
 * held for the undo window and posted later; a 404 tells that post the gift is already gone,
 * which counts as removed (docs/02 §2.23) — any other refusal brings the row back.
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
