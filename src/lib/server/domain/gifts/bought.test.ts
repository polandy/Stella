import { beforeEach, describe, expect, it } from 'bun:test';
import { fakeOwnPeople } from '../shared/idea-on-person.fixture';
import { inEnglish } from '../../../i18n/phrase';
import { markGiftBought, readyGifts } from './bought';
import { fakeGifts } from './gifts.fixture';
import {
	addGift,
	countOpenIdeas,
	InvalidGiftError,
	listOpenIdeas,
	markGiftGiven,
	type GiftDeps
} from './gifts';

/* A gift bought and waiting to be handed over (docs/dev/02 §2.25.9), over an in-memory port. */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const HILDE = 'hilde';
const VIEWER = { id: 'julia', householdId: 'h1' };

let gifts: ReturnType<typeof fakeGifts>;
let deps: GiftDeps;
let now: number;
let counter: number;

beforeEach(() => {
	gifts = fakeGifts(() => ({ value: '2018-03-14', precision: 'full' }));
	now = Date.UTC(2026, 9, 8, 9);
	counter = 0;
	deps = {
		gifts,
		ownPeople: fakeOwnPeople(),
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				return { id, birthDate: '2018-03-14', birthDatePrecision: 'full' } as never;
			}
		},
		ids: { next: () => `gift-${++counter}` },
		clock: { now: () => now }
	};
});

async function noteIdea(title: string, when?: { kind: 'on_date'; on: string }) {
	const { giftId } = await addGift(deps, ANDY, {
		contactId: HILDE,
		state: 'idea',
		title,
		note: null,
		url: null,
		givenOn: null,
		occasion: null,
		visibility: 'shared',
		when
	});
	return giftId;
}

const bought = (giftId: string, yes = true) =>
	markGiftBought(deps, JULIA, { contactId: HILDE, giftId, bought: yes });

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidGiftError) return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('markGiftBought', () => {
	it('marks anyone’s idea bought, keeping its when for when it is taken back', async () => {
		const giftId = await noteIdea('Bike', { kind: 'on_date', on: '2026-12-24' });
		now += 1000;
		await bought(giftId);
		expect(gifts.rows.get(giftId)).toMatchObject({
			state: 'bought',
			when: { kind: 'on_date', on: '2026-12-24' },
			givenOn: null,
			updatedAt: now
		});
		await bought(giftId, false);
		expect(gifts.rows.get(giftId)).toMatchObject({
			state: 'idea',
			when: { kind: 'on_date', on: '2026-12-24' }
		});
	});

	it('changes nothing when asked for the state it is already in, as a second tap would', async () => {
		const giftId = await noteIdea('Bike');
		await bought(giftId);
		now += 1000;
		await bought(giftId);
		expect(gifts.rows.get(giftId)?.updatedAt).toBe(Date.UTC(2026, 9, 8, 9));
		await bought(giftId, false);
		await bought(giftId, false);
		expect(gifts.rows.get(giftId)?.state).toBe('idea');
	});

	it('refuses a gift already given, either way', async () => {
		const giftId = await noteIdea('Bike');
		await markGiftGiven(deps, JULIA, {
			contactId: HILDE,
			giftId,
			givenOn: '2026-10-08',
			occasion: null
		});
		expect(await refusal(bought(giftId))).toBe('This gift was already given.');
		expect(await refusal(bought(giftId, false))).toBe('This gift was already given.');
	});

	it('hands a bought gift over like an idea: it gets its day, and its when is done', async () => {
		const giftId = await noteIdea('Bike', { kind: 'on_date', on: '2026-12-24' });
		await bought(giftId);
		await markGiftGiven(deps, ANDY, {
			contactId: HILDE,
			giftId,
			givenOn: '2026-12-24',
			occasion: 'christmas'
		});
		expect(gifts.rows.get(giftId)).toMatchObject({
			state: 'given',
			givenOn: '2026-12-24',
			occasion: 'christmas',
			when: null
		});
	});
});

describe('a bought gift leaves the list and the counts, and shows as ready', () => {
	it('is no open idea any more, but one ready to give', async () => {
		const bike = await noteIdea('Bike');
		await noteIdea('Book');
		await bought(bike);
		expect((await listOpenIdeas(deps, VIEWER)).map((i) => i.title)).toEqual(['Book']);
		expect(await countOpenIdeas(deps, VIEWER, [HILDE])).toEqual(new Map([[HILDE, 1]]));
		expect(await readyGifts(deps, VIEWER, [HILDE, HILDE])).toEqual(new Map([[HILDE, ['Bike']]]));
	});

	it('leaves out a person with nothing ready, and asks nothing for nobody', async () => {
		await noteIdea('Book');
		expect(await readyGifts(deps, VIEWER, [HILDE])).toEqual(new Map());
		expect(await readyGifts(deps, VIEWER, [])).toEqual(new Map());
	});
});
