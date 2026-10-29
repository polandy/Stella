import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { GiftGoneError } from '$lib/server/domain/gifts/gifts';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions } from './+page.server';

/*
 * *Mark as given* on the household's list (docs/02 §2.25.6), as the edge answers it. The list
 * has no person in its URL, so the form names them and the access layer checks it; the answer
 * goes back to the list. The row's answer is held for the undo window, and a 404 tells that
 * post the idea is already gone (docs/02 §2.23).
 */

const t = createTranslator('en');

const commanding = (handlers: Partial<CommandHandlers>): FakeServices => ({
	offline: { commandDeps: commandDepsWith(handlers) }
});

const give = (services: FakeServices) =>
	answerOf(
		actions.markGiftGiven(
			routeEvent({
				services,
				params: {},
				form: formOf({
					giftId: 'g1',
					contactId: 'anna',
					givenOn: '2026-11-11',
					occasionChoice: 'birthday'
				})
			})
		)
	);

describe('markGiftGiven on the list', () => {
	it('gives the idea of the person the form names and returns to the list', async () => {
		const given: unknown[] = [];
		const services = commanding({
			'gift.markGiven': async (_actor, payload) => {
				given.push(payload);
				return { giftId: 'g1' };
			}
		});
		expect(await give(services)).toEqual({ kind: 'redirect', status: 303, location: '/gifts' });
		expect(given).toEqual([
			{ contactId: 'anna', giftId: 'g1', givenOn: '2026-11-11', occasion: 'birthday' }
		]);
	});

	it('answers 404 for an idea already gone, with the reason on its row', async () => {
		const services = commanding({
			'gift.markGiven': async () => {
				throw new GiftGoneError();
			}
		});
		expect(await give(services)).toEqual({
			kind: 'fail',
			status: 404,
			data: { giftRowError: { giftId: 'g1', message: t('errors.gift.gone') } }
		});
	});
});
