import { describe, expect, it } from 'bun:test';
import { createTranslator } from '#lib/i18n/translate.js';
import type { CommandHandlers } from '#lib/server/domain/commands/dispatch.js';
import { GiftGoneError } from '#lib/server/domain/gifts/gifts.js';
import { commandDepsWith } from '#lib/server/domain/testing/index.js';
import { answerOf, formOf, routeEvent, type FakeServices } from '#lib/server/testing/index.js';
import { giftActions } from '../contacts/[id]/actions/gifts';

/* *Nachtragen…* posted from the Gifts card (docs/dev/02 §2.25.14): one command per gift, in order. */

const t = createTranslator('en');

function recording(sent: [string, unknown][], refuse?: string): FakeServices {
	const handler = (type: string) => async (_actor: unknown, payload: { giftId?: string }) => {
		if (refuse && payload.giftId === refuse) throw new GiftGoneError();
		sent.push([type, payload]);
		return { giftId: payload.giftId ?? 'new' };
	};
	const handlers = {
		'gift.markGiven': handler('gift.markGiven'),
		'gift.add': handler('gift.add')
	} as unknown as Partial<CommandHandlers>;
	return { offline: { commandDeps: commandDepsWith(handlers) } };
}

const post = (services: FakeServices, fields: Record<string, string | string[]>) =>
	answerOf(
		giftActions.recordGifts(routeEvent({ services, params: { id: 'tomy' }, form: formOf(fields) }))
	);

const sheet = {
	givenOn: '2026-12-24',
	occasion: 'christmas',
	planned: ['tomy/g1', 'tomy/g2'],
	rows: '2',
	'title-0': 'Puzzle',
	'for-0': 'tomy',
	'from-0': 'sandra',
	'title-1': '',
	'for-1': 'tomy',
	'from-1': ''
};

describe('recordGifts', () => {
	it('marks the ticked ones given, notes the rows, and returns to the card', async () => {
		const sent: [string, unknown][] = [];
		expect(await post(recording(sent), sheet)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/tomy#section-gifts'
		});
		expect(sent.map(([type]) => type)).toEqual(['gift.markGiven', 'gift.markGiven', 'gift.add']);
		expect(sent[2][1]).toMatchObject({
			contactId: 'tomy',
			state: 'given',
			title: 'Puzzle',
			givenOn: '2026-12-24',
			occasion: 'christmas',
			giver: { contactId: 'sandra' }
		});
	});

	it('sends nothing for a sheet with nothing in it', async () => {
		const sent: [string, unknown][] = [];
		const answer = await post(recording(sent), { ...sheet, planned: [], 'title-0': '' });
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { giftRecordError: t('errors.gift.record.nothing') }
		});
		expect(sent).toEqual([]);
	});

	it('sends nothing without a real day', async () => {
		const sent: [string, unknown][] = [];
		const answer = await post(recording(sent), { ...sheet, givenOn: '' });
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: { giftRecordError: t('errors.gift.needDay') }
		});
		expect(sent).toEqual([]);
	});

	it('stops at a refused gift, keeping the ones before and saying how many went in', async () => {
		const sent: [string, unknown][] = [];
		const answer = await post(recording(sent, 'g2'), sheet);
		expect(answer).toEqual({
			kind: 'fail',
			status: 400,
			data: {
				giftRecordError: t('errors.gift.record.stopped', {
					saved: 1,
					reason: t('errors.gift.gone')
				}),
				recorded: 1
			}
		});
		expect(sent.map(([type]) => type)).toEqual(['gift.markGiven']);
	});
});
