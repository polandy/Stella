import { describe, expect, it } from 'bun:test';
import { createTranslator } from '#lib/i18n/translate.js';
import type { CommandHandlers } from '#lib/server/domain/commands/dispatch.js';
import { GiftGoneError } from '#lib/server/domain/gifts/gifts.js';
import { commandDepsWith } from '#lib/server/domain/testing/index.js';
import { answerOf, formOf, routeEvent, type FakeServices } from '#lib/server/testing/index.js';
import { giftGroupActions as actions } from './gift-groups';

// *Who has it?* on a person's Gifts card (docs/dev/02 §2.25.11), as the edge answers it.

const t = createTranslator('en');
const BACK = { kind: 'redirect' as const, status: 303, location: '/contacts/anna#section-gifts' };

function recording(type: keyof CommandHandlers, seen: unknown[]): FakeServices {
	return {
		offline: {
			commandDeps: commandDepsWith({
				[type]: async (_actor: unknown, payload: unknown) => {
					seen.push(payload);
					return { groupId: 'gg', giftIds: [], giftId: 'g1', kept: [], skipped: [] };
				}
			})
		}
	};
}

const post = (
	action: keyof typeof actions,
	services: FakeServices,
	fields: Record<string, string>
) =>
	answerOf(actions[action](routeEvent({ services, params: { id: 'anna' }, form: formOf(fields) })));

describe('the group as a whole', () => {
	it('adds people with what the panel worked out for them', async () => {
		const seen: unknown[] = [];
		const answer = await post('addGroupRecipients', recording('giftGroup.addRecipients', seen), {
			groupId: 'gg',
			recipients: JSON.stringify([{ contactId: 'finn' }, { contactId: 'noah', birthYear: '2023' }])
		});
		expect(answer).toEqual(BACK);
		expect(seen).toEqual([
			{
				groupId: 'gg',
				recipients: [{ contactId: 'finn' }, { contactId: 'noah', birthYear: '2023' }]
			}
		]);
	});

	it('changes it for everyone open, or for one person only, with the when the picker chose', async () => {
		const seen: unknown[] = [];
		const services = recording('giftGroup.edit', seen);
		const fields = {
			groupId: 'gg',
			title: 'Puzzle',
			note: '',
			url: '',
			whenKind: 'at_age',
			whenAge: '6'
		};
		await post('editGiftGroup', services, fields);
		await post('editGiftGroup', services, { ...fields, only: 'g-ben' });
		expect(seen).toEqual([
			{ groupId: 'gg', title: 'Puzzle', note: null, url: null, when: { kind: 'at_age', age: 6 } },
			{
				groupId: 'gg',
				giftId: 'g-ben',
				title: 'Puzzle',
				note: null,
				url: null,
				when: { kind: 'at_age', age: 6 }
			}
		]);
	});

	it('marks it bought, removes the open ones, lets them go on alone', async () => {
		for (const [action, type] of [
			['markGroupBought', 'giftGroup.markBought'],
			['removeGroupOpen', 'giftGroup.removeOpen'],
			['dissolveGiftGroup', 'giftGroup.dissolve']
		] as const) {
			const seen: unknown[] = [];
			expect(await post(action, recording(type, seen), { groupId: 'gg' })).toEqual(BACK);
			expect(seen).toEqual([{ groupId: 'gg' }]);
		}
	});

	it('answers a refusal on the group’s panel, and 404 for a group gone', async () => {
		const services: FakeServices = {
			offline: {
				commandDeps: commandDepsWith({
					'giftGroup.markBought': async () => {
						throw new GiftGoneError();
					}
				})
			}
		};
		expect(await post('markGroupBought', services, { groupId: 'gg' })).toEqual({
			kind: 'fail',
			status: 404,
			data: { giftGroupError: { groupId: 'gg', message: t('errors.gift.gone') } }
		});
	});
});

describe('one person of the group', () => {
	it('lets one go on alone', async () => {
		const seen: unknown[] = [];
		await post('detachGroupGift', recording('giftGroup.detach', seen), {
			groupId: 'gg',
			giftId: 'g-ben'
		});
		expect(seen).toEqual([{ groupId: 'gg', giftId: 'g-ben' }]);
	});

	it('gives, unbuys and removes the gift of the person the row names, back on this card', async () => {
		const given: unknown[] = [];
		expect(
			await post('markGroupGiftGiven', recording('gift.markGiven', given), {
				groupId: 'gg',
				giftId: 'g-ben',
				contactId: 'ben',
				givenOn: '2026-11-18',
				occasionChoice: 'christmas'
			})
		).toEqual(BACK);
		expect(given).toEqual([
			{ giftId: 'g-ben', givenOn: '2026-11-18', occasion: 'christmas', contactId: 'ben' }
		]);

		const unbought: unknown[] = [];
		await post('markGroupGiftBought', recording('gift.markBought', unbought), {
			giftId: 'g-lea',
			contactId: 'lea'
		});
		expect(unbought).toEqual([{ giftId: 'g-lea', bought: false, contactId: 'lea' }]);

		const removed: unknown[] = [];
		await post('removeGroupGift', recording('gift.remove', removed), {
			giftId: 'g-lea',
			contactId: 'lea'
		});
		expect(removed).toEqual([{ giftId: 'g-lea', contactId: 'lea' }]);
	});
});
