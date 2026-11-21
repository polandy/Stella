import { describe, expect, it } from 'bun:test';
import { createTranslator } from '#lib/i18n/translate.js';
import type { CommandHandlers } from '#lib/server/domain/commands/dispatch.js';
import { GiftGoneError } from '#lib/server/domain/gifts/gifts.js';
import { commandDepsWith } from '#lib/server/domain/testing/index.js';
import { answerOf, formOf, routeEvent, type FakeServices } from '#lib/server/testing/index.js';
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

describe('markGiftBought on the card (§2.25.9)', () => {
	it('marks the idea bought, and takes it back when the field is left out', async () => {
		const marks: unknown[] = [];
		const services = commanding({
			'gift.markBought': async (_actor, payload) => {
				marks.push(payload);
				return { giftId: 'g1' };
			}
		});
		const mark = (fields: Record<string, string>) =>
			answerOf(
				actions.markGiftBought(
					routeEvent({
						services,
						params: { id: 'anna' },
						form: formOf({ giftId: 'g1', ...fields })
					})
				)
			);
		expect(await mark({ bought: 'on' })).toMatchObject({ kind: 'redirect' });
		await mark({});
		expect(marks).toEqual([
			{ contactId: 'anna', giftId: 'g1', bought: true },
			{ contactId: 'anna', giftId: 'g1', bought: false }
		]);
	});

	it('carries where it waits and the surprise its author kept', async () => {
		const marks: unknown[] = [];
		const services = commanding({
			'gift.markBought': async (_actor, payload) => {
				marks.push(payload);
				return { giftId: 'g1' };
			}
		});
		await answerOf(
			actions.markGiftBought(
				routeEvent({
					services,
					params: { id: 'anna' },
					form: formOf({ giftId: 'g1', bought: 'on', storedAt: 'cellar', surprise: 'kept' })
				})
			)
		);
		expect(marks).toEqual([
			{
				contactId: 'anna',
				giftId: 'g1',
				bought: true,
				storedAt: 'cellar',
				hiddenFromRecipient: true
			}
		]);
	});
});

describe('assignGift on the card (§2.25.12)', () => {
	const assigning = (sent: unknown[]) =>
		commanding({
			'gift.assign': async (_actor, payload) => {
				sent.push(payload);
				return { giftId: 'g1' };
			}
		});
	const assign = (services: FakeServices, fields: Record<string, string>) =>
		answerOf(
			actions.assignGift(
				routeEvent({ services, params: { id: 'anna' }, form: formOf({ giftId: 'g1', ...fields }) })
			)
		);

	it('gives it to a person or the household, or frees it, keeping the when without a picker', async () => {
		const sent: unknown[] = [];
		const services = assigning(sent);
		expect(await assign(services, { giver: 'sandra' })).toMatchObject({ kind: 'redirect' });
		await assign(services, { giver: 'household' });
		await assign(services, { giver: '' });
		await assign(services, { giver: 'sandra', free: 'on' });
		expect(sent).toEqual([
			{ contactId: 'anna', giftId: 'g1', giver: { contactId: 'sandra' } },
			{ contactId: 'anna', giftId: 'g1', giver: { household: true } },
			{ contactId: 'anna', giftId: 'g1', giver: null },
			{ contactId: 'anna', giftId: 'g1', giver: null }
		]);
	});

	it('sends the when the picker chose, and the surprise when the form asks it', async () => {
		const sent: unknown[] = [];
		const services = assigning(sent);
		await assign(services, {
			giver: 'sandra',
			whenKind: 'at_age',
			whenAge: '10',
			surprise: 'kept'
		});
		await assign(services, { giver: 'sandra', whenKind: 'now', surprise: 'open' });
		expect(sent).toMatchObject([
			{ when: { kind: 'at_age', age: 10 }, hiddenFromRecipient: true },
			{ when: null, hiddenFromRecipient: false }
		]);
	});
});

describe('the visibility choice on the card (§2.25.10)', () => {
	const noting = (sent: unknown[]) =>
		commanding({
			'gift.add': async (_actor, payload) => {
				sent.push(payload);
				return { giftId: 'g1' };
			},
			'gift.edit': async (_actor, payload) => {
				sent.push(payload);
				return { giftId: 'g1' };
			}
		});
	const fields = { title: 'Scarf', state: 'idea', whenKind: 'now' };

	it('sends *Everyone but …* as a shared gift kept from its person, and *Everyone* as one kept from nobody', async () => {
		const sent: unknown[] = [];
		const services = noting(sent);
		const add = (visibility: string) =>
			answerOf(
				actions.addGift(
					routeEvent({ services, params: { id: 'anna' }, form: formOf({ ...fields, visibility }) })
				)
			);
		expect(await add('surprise')).toMatchObject({ kind: 'redirect' });
		await add('shared');
		expect(sent).toMatchObject([
			{ visibility: 'shared', hiddenFromRecipient: true },
			{ visibility: 'shared', hiddenFromRecipient: false }
		]);
	});

	it('sends who gives a new gift, or nobody when the field is left out', async () => {
		const sent: unknown[] = [];
		const services = noting(sent);
		const add = (extra: Record<string, string>) =>
			answerOf(
				actions.addGift(
					routeEvent({
						services,
						params: { id: 'anna' },
						form: formOf({ ...fields, visibility: 'shared', ...extra })
					})
				)
			);
		await add({ giver: 'sandra' });
		await add({});
		expect(sent).toMatchObject([{ giver: { contactId: 'sandra' } }, { giver: null }]);
	});

	it('sends a private gift as kept from nobody, on an edit too', async () => {
		const sent: unknown[] = [];
		await answerOf(
			actions.editGift(
				routeEvent({
					services: noting(sent),
					params: { id: 'anna' },
					form: formOf({ giftId: 'g1', title: 'Scarf', visibility: 'private' })
				})
			)
		);
		expect(sent).toMatchObject([
			{ giftId: 'g1', visibility: 'private', hiddenFromRecipient: false }
		]);
	});
});
