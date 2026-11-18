import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { CommandHandlers } from '$lib/server/domain/commands/dispatch';
import { fakeGifts } from '$lib/server/domain/gifts/gifts.fixture';
import type { GiftDeps } from '$lib/server/domain/gifts/gifts';
import { commandDepsWith } from '$lib/server/domain/testing';
import { answerOf, formOf, routeEvent, type FakeServices } from '$lib/server/testing';
import { actions, load } from './+page.server';

/*
 * One idea for several people (docs/dev/02 §2.25.11), as the edge answers it: the form posts the
 * people it chose as one field, the command plans each, and the member lands on the first one's
 * Gifts card.
 */

const t = createTranslator('en');

const commanding = (handlers: Partial<CommandHandlers>): FakeServices => ({
	offline: { commandDeps: commandDepsWith(handlers) }
});

const FIELDS = {
	title: 'Lego',
	whenKind: 'at_age',
	whenAge: '5',
	visibility: 'shared',
	recipients: JSON.stringify([{ contactId: 'mia' }, { contactId: 'noah', birthYear: '2022' }])
};

const add = (services: FakeServices, fields: Record<string, string> = FIELDS) =>
	answerOf(actions.add(routeEvent({ services, params: {}, form: formOf(fields) })));

describe('add, one idea for several', () => {
	it('notes it for the people chosen and lands on the first one’s Gifts card', async () => {
		const noted: unknown[] = [];
		const services = commanding({
			'giftGroup.add': async (_actor, payload) => {
				noted.push(payload);
				return { groupId: 'g', giftIds: ['a', 'b'], skipped: [] };
			}
		});
		expect(await add(services)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/mia#section-gifts'
		});
		expect(noted).toEqual([
			{
				title: 'Lego',
				note: null,
				url: null,
				occasion: 'birthday',
				visibility: 'shared',
				hiddenFromRecipients: false,
				when: { kind: 'at_age', age: 5 },
				recipients: [{ contactId: 'mia' }, { contactId: 'noah', birthYear: '2022' }]
			}
		]);
	});

	it('asks for a title, and for someone to note it for', async () => {
		const services = commanding({});
		expect(await add(services, { ...FIELDS, title: '' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { giftError: t('errors.gift.needTitle') }
		});
		expect(await add(services, { ...FIELDS, recipients: '[]' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { giftError: t('errors.giftGroup.recipients') }
		});
	});
});

describe('load', () => {
	const gifts = (ownPeople: Map<string, string>) =>
		({ gifts: fakeGifts(() => null, ownPeople) }) as unknown as GiftDeps;

	it('names the people a surprise is kept from, and offers no shortcuts without a person', async () => {
		const services: FakeServices = {
			gifts: {
				giftDeps: gifts(
					new Map([
						['self-u1', 'u1'],
						['self-u2', 'u2']
					])
				)
			}
		};
		const data = await load(routeEvent({ services, url: '/gifts/several' }));
		expect(data).toMatchObject({ anchorId: null, shortcuts: [], keptFrom: ['self-u2'] });
	});
});
