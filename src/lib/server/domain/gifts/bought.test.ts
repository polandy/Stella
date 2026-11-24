import { beforeEach, describe, expect, it } from 'bun:test';
import { fakeOwnPeople } from '../shared/idea-on-person.fixture';
import { inEnglish } from '../../../i18n/phrase';
import { giftPlaces, markGiftBought, readyGifts } from './bought';
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

describe('where a bought gift is kept (D20)', () => {
	const boughtAt = (giftId: string, storedAt: string | null) =>
		markGiftBought(deps, JULIA, { contactId: HILDE, giftId, bought: true, storedAt });

	it('keeps the place it is stored at, trimmed, and forgets it once it is an idea again', async () => {
		const giftId = await noteIdea('Bike');
		await boughtAt(giftId, '  Estrich, Box 3 ');
		expect(gifts.rows.get(giftId)).toMatchObject({ state: 'bought', storedAt: 'Estrich, Box 3' });
		await bought(giftId, false);
		expect(gifts.rows.get(giftId)?.storedAt).toBeNull();
	});

	it('stores no place for a blank one, and none at all without one', async () => {
		const blank = await noteIdea('Bike');
		await boughtAt(blank, '   ');
		expect(gifts.rows.get(blank)?.storedAt).toBeNull();
		const plain = await noteIdea('Book');
		await bought(plain);
		expect(gifts.rows.get(plain)?.storedAt).toBeNull();
	});

	it('moves a bought gift to another place, as a second *Bought…* would', async () => {
		const giftId = await noteIdea('Bike');
		await boughtAt(giftId, 'Estrich');
		await boughtAt(giftId, 'Keller');
		expect(gifts.rows.get(giftId)?.storedAt).toBe('Keller');
	});

	it('offers the places already used, latest first, each once', async () => {
		const a = await noteIdea('Bike');
		const b = await noteIdea('Book');
		const c = await noteIdea('Ball');
		await boughtAt(a, 'Estrich');
		now += 1000;
		await boughtAt(b, 'Keller');
		now += 1000;
		await boughtAt(c, 'Estrich');
		expect(await giftPlaces(deps, VIEWER)).toEqual(['Estrich', 'Keller']);
	});
});

describe('bought for a member, kept from them (D23)', () => {
	const MAMA = 'mama';
	const keeping = (giftId: string, hiddenFromRecipient: boolean, actor = ANDY) =>
		markGiftBought(deps, actor, {
			contactId: MAMA,
			giftId,
			bought: true,
			hiddenFromRecipient
		});

	beforeEach(() => {
		gifts = fakeGifts(() => null, new Map([[MAMA, 'julia']]));
		deps = { ...deps, gifts, ownPeople: fakeOwnPeople(new Map([[MAMA, 'julia']])) };
	});

	async function ideaForMama() {
		const { giftId } = await addGift(deps, ANDY, {
			contactId: MAMA,
			state: 'idea',
			title: 'Scarf',
			note: null,
			url: null,
			givenOn: null,
			occasion: null,
			visibility: 'shared'
		});
		return giftId;
	}

	it('keeps it from her when its author asks, as *Bought…* offers', async () => {
		const giftId = await ideaForMama();
		await keeping(giftId, true);
		expect(gifts.rows.get(giftId)).toMatchObject({ state: 'bought', hiddenFromRecipient: true });
	});

	it('leaves the surprise as it was when someone else marks it bought', async () => {
		const giftId = await ideaForMama();
		await keeping(giftId, true, { userId: 'papa', householdId: 'h1' });
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(false);
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

	it('is ready only when the household hands it over, never someone else’s *Done* (D17)', async () => {
		const ours = await noteIdea('Bike');
		const theirs = await noteIdea('Skates');
		await bought(ours);
		await bought(theirs);
		gifts.rows.set(theirs, {
			...gifts.rows.get(theirs)!,
			giverContactId: 'grandma',
			giverName: 'Grandma'
		});
		expect(await readyGifts(deps, VIEWER, [HILDE])).toEqual(new Map([[HILDE, ['Bike']]]));
	});

	it('counts what *Wir* or one of the household’s own people gives (D17)', async () => {
		deps = { ...deps, ownPeople: fakeOwnPeople(new Map([['julia-person', JULIA.userId]])) };
		const byUs = await noteIdea('Bike');
		const byJulia = await noteIdea('Book');
		await bought(byUs);
		await bought(byJulia);
		gifts.rows.set(byUs, { ...gifts.rows.get(byUs)!, giverIsHousehold: true });
		gifts.rows.set(byJulia, {
			...gifts.rows.get(byJulia)!,
			giverContactId: 'julia-person',
			giverName: 'Julia'
		});
		expect(await readyGifts(deps, VIEWER, [HILDE])).toEqual(new Map([[HILDE, ['Bike', 'Book']]]));
	});

	it('counts a gift given together once a co-giver is ours, not when none is (D17)', async () => {
		deps = { ...deps, ownPeople: fakeOwnPeople(new Map([['julia-person', JULIA.userId]])) };
		const withJulia = await noteIdea('Bike');
		const withoutUs = await noteIdea('Skates');
		await bought(withJulia);
		await bought(withoutUs);
		const grandma = { giverContactId: 'grandma', giverName: 'Grandma' };
		gifts.rows.set(withJulia, {
			...gifts.rows.get(withJulia)!,
			...grandma,
			coGivers: [{ contactId: 'julia-person', name: 'Julia', leftName: null }]
		});
		gifts.rows.set(withoutUs, {
			...gifts.rows.get(withoutUs)!,
			...grandma,
			coGivers: [{ contactId: 'uncle', name: 'Uncle', leftName: null }]
		});
		expect(await readyGifts(deps, VIEWER, [HILDE])).toEqual(new Map([[HILDE, ['Bike']]]));
	});

	it('leaves out a gift whose giver has left, by the name they left (D17)', async () => {
		const giftId = await noteIdea('Bike');
		await bought(giftId);
		gifts.rows.set(giftId, { ...gifts.rows.get(giftId)!, giverLeftName: 'Old friend' });
		expect(await readyGifts(deps, VIEWER, [HILDE])).toEqual(new Map());
	});
});
