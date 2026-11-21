import { beforeEach, describe, expect, it } from 'bun:test';
import { fakeOwnPeople } from '../shared/idea-on-person.fixture';
import { inEnglish } from '../../../i18n/phrase';
import { markGiftBought } from './bought';
import { fakeGifts } from './gifts.fixture';
import { addGift, InvalidGiftError, markGiftGiven, type AddGiftInput, type GiftDeps } from './gifts';
import { assignGift } from './giver';

/* Who gives a gift (docs/dev/02 §2.25.12), over an in-memory port. */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const TOMY = 'tomy';
const NAMES: Record<string, string> = { tomy: 'Tomy', sandra: 'Sandra', marco: 'Marco' };
// Andy's private contact, out of Julia's view.
const HIDDEN = 'secret';

let gifts: ReturnType<typeof fakeGifts>;
let deps: GiftDeps;
let own: Map<string, string>;
let now: number;
let counter: number;

beforeEach(() => {
	own = new Map();
	gifts = fakeGifts(() => null, own);
	now = Date.UTC(2026, 10, 21, 9);
	counter = 0;
	deps = {
		gifts,
		ownPeople: fakeOwnPeople(own),
		contacts: {
			async findByIdVisibleTo(viewer, id) {
				if (id === HIDDEN && viewer.id !== 'andy') return null;
				const displayName = NAMES[id] ?? id;
				return { id, displayName, birthDate: '2018-03-14', birthDatePrecision: 'full' } as never;
			}
		},
		ids: { next: () => `gift-${++counter}` },
		clock: { now: () => now }
	};
});

async function note(fields: Partial<AddGiftInput> = {}) {
	const { giftId } = await addGift(deps, ANDY, {
		contactId: TOMY,
		state: 'idea',
		title: 'Puzzle',
		note: null,
		url: null,
		givenOn: null,
		occasion: null,
		visibility: 'shared',
		...fields
	});
	return giftId;
}

const assign = (giftId: string, fields: Partial<Parameters<typeof assignGift>[2]> = {}) =>
	assignGift(deps, JULIA, { contactId: TOMY, giftId, giver: { contactId: 'sandra' }, ...fields });

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidGiftError) return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('addGift with a giver', () => {
	it('notes an idea nobody gives yet, as before givers', async () => {
		const giftId = await note();
		expect(gifts.rows.get(giftId)).toMatchObject({
			giverContactId: null,
			giverIsHousehold: false,
			giverLeftName: null
		});
	});

	it('notes an idea a person gives, or the household itself', async () => {
		const sandras = await note({ giver: { contactId: 'sandra' } });
		const ours = await note({ giver: { household: true } });
		expect(gifts.rows.get(sandras)).toMatchObject({ giverContactId: 'sandra', giverName: 'Sandra' });
		expect(gifts.rows.get(ours)).toMatchObject({ giverContactId: null, giverIsHousehold: true });
	});

	it('records who gave a gift already given', async () => {
		const giftId = await note({
			state: 'given',
			givenOn: '2025-12-24',
			giver: { contactId: 'sandra' }
		});
		expect(gifts.rows.get(giftId)).toMatchObject({ state: 'given', giverContactId: 'sandra' });
	});

	it('names nobody on a gift received: it came from its person', async () => {
		const giftId = await note({
			state: 'received',
			givenOn: '2025-12-24',
			giver: { contactId: 'sandra' }
		});
		expect(gifts.rows.get(giftId)).toMatchObject({ giverContactId: null, giverIsHousehold: false });
	});

	it('refuses the person it is for as its giver', async () => {
		expect(await refusal(note({ giver: { contactId: TOMY } }))).toMatch(/for/i);
	});

	it('refuses a giver the author cannot see', async () => {
		const asJulia = addGift(deps, JULIA, {
			contactId: TOMY,
			state: 'idea',
			title: 'Puzzle',
			note: null,
			url: null,
			givenOn: null,
			occasion: null,
			visibility: 'shared',
			giver: { contactId: HIDDEN }
		});
		expect(await refusal(asJulia)).toMatch(/no longer/i);
	});
});

describe('assignGift', () => {
	it('gives anyone’s open idea to a person, keeping its when', async () => {
		const giftId = await note({ when: { kind: 'on_date', on: '2026-12-24' } });
		now += 1000;
		await assign(giftId);
		expect(gifts.rows.get(giftId)).toMatchObject({
			state: 'idea',
			giverContactId: 'sandra',
			giverName: 'Sandra',
			when: { kind: 'on_date', on: '2026-12-24' },
			updatedAt: now
		});
	});

	it('moves it to another giver, to the household, and frees it again', async () => {
		const giftId = await note({ giver: { contactId: 'sandra' } });
		await assign(giftId, { giver: { contactId: 'marco' } });
		expect(gifts.rows.get(giftId)).toMatchObject({ giverContactId: 'marco' });
		await assign(giftId, { giver: { household: true } });
		expect(gifts.rows.get(giftId)).toMatchObject({ giverContactId: null, giverIsHousehold: true });
		await assign(giftId, { giver: null });
		expect(gifts.rows.get(giftId)).toMatchObject({ giverContactId: null, giverIsHousehold: false });
	});

	it('clears the name a deleted giver left once someone else gives it', async () => {
		const giftId = await note();
		gifts.rows.set(giftId, { ...gifts.rows.get(giftId)!, giverLeftName: 'Ruth' });
		await assign(giftId);
		expect(gifts.rows.get(giftId)).toMatchObject({ giverLeftName: null, giverContactId: 'sandra' });
	});

	it('sets the occasion it is meant for, checked like any when', async () => {
		const giftId = await note();
		await assign(giftId, { when: { kind: 'christmas_at_age', age: 9 } });
		expect(gifts.rows.get(giftId)?.when).toEqual({ kind: 'christmas_at_age', age: 9 });
		expect(gifts.rows.get(giftId)?.whenCheckedOn).toBe('2026-11-21');
		expect(await refusal(assign(giftId, { when: { kind: 'on_date', on: '2020-01-01' } }))).toBeTruthy();
	});

	it('gives a bought gift too', async () => {
		const giftId = await note();
		await markGiftBought(deps, JULIA, { contactId: TOMY, giftId, bought: true });
		await assign(giftId);
		expect(gifts.rows.get(giftId)).toMatchObject({ state: 'bought', giverContactId: 'sandra' });
	});

	it('refuses a gift already given', async () => {
		const giftId = await note();
		await markGiftGiven(deps, ANDY, {
			contactId: TOMY,
			giftId,
			givenOn: '2026-11-20',
			occasion: null
		});
		expect(await refusal(assign(giftId))).toMatch(/already/i);
	});

	it('lets only its author keep it from the member it is for', async () => {
		own.set(TOMY, 'tomy-member');
		const giftId = await note();
		await assign(giftId, { hiddenFromRecipient: true });
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(false);
		await assignGift(deps, ANDY, {
			contactId: TOMY,
			giftId,
			giver: { contactId: 'sandra' },
			hiddenFromRecipient: true
		});
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(true);
	});
});
