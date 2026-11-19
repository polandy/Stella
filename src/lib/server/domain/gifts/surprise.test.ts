import { beforeEach, describe, expect, it } from 'bun:test';
import { fakeOwnPeople } from '../shared/idea-on-person.fixture';
import { inEnglish } from '../../../i18n/phrase';
import { readyGifts } from './bought';
import { fakeGifts } from './gifts.fixture';
import {
	addGift,
	countOpenIdeas,
	editGift,
	InvalidGiftError,
	listGiftsForContact,
	listOpenIdeas,
	type AddGiftInput,
	type GiftDeps
} from './gifts';

/*
 * A gift kept from the person it is for (docs/dev/02 §2.25.10): shared with the household, never
 * shown to the member whose own person that is. Over an in-memory port that keeps the rule.
 */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
/** Julia's own person. */
const JULIA_PERSON = 'julia-person';

let gifts: ReturnType<typeof fakeGifts>;
let deps: GiftDeps;
let counter: number;

beforeEach(() => {
	gifts = fakeGifts(() => null, new Map([[JULIA_PERSON, 'julia']]));
	counter = 0;
	deps = {
		gifts,
		ownPeople: fakeOwnPeople(new Map([[JULIA_PERSON, 'julia']])),
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				return { id, birthDate: null, birthDatePrecision: 'full' } as never;
			}
		},
		ids: { next: () => `gift-${++counter}` },
		clock: { now: () => Date.UTC(2026, 9, 8, 9) }
	};
});

const forJulia = (overrides: Partial<AddGiftInput> = {}): AddGiftInput => ({
	contactId: JULIA_PERSON,
	state: 'idea',
	title: 'Necklace',
	note: null,
	url: null,
	givenOn: null,
	occasion: null,
	visibility: 'shared',
	hiddenFromRecipient: true,
	...overrides
});

const viewer = (actor: typeof ANDY) => ({ id: actor.userId, householdId: actor.householdId });

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidGiftError) return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('a surprise for a member', () => {
	it('is kept from them on every read the use-cases make, and shown to everyone else', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia());
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(true);
		expect(await listGiftsForContact(deps, viewer(JULIA), JULIA_PERSON)).toEqual([]);
		expect(await listOpenIdeas(deps, viewer(JULIA))).toEqual([]);
		expect(await countOpenIdeas(deps, viewer(JULIA), [JULIA_PERSON])).toEqual(new Map());
		expect((await listOpenIdeas(deps, viewer(ANDY))).map((i) => i.id)).toEqual([giftId]);
	});

	it('stays kept from them once bought', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia());
		gifts.rows.set(giftId, { ...gifts.rows.get(giftId)!, state: 'bought' });
		expect(await readyGifts(deps, viewer(JULIA), [JULIA_PERSON])).toEqual(new Map());
		expect(await readyGifts(deps, viewer(ANDY), [JULIA_PERSON])).toEqual(
			new Map([[JULIA_PERSON, ['Necklace']]])
		);
	});

	it('is refused to the member it would be for: nobody keeps a gift from themselves', async () => {
		expect(await refusal(addGift(deps, JULIA, forJulia()))).toBe(
			'You cannot keep a gift from yourself — it is for you.'
		);
	});

	it('is nothing on a private gift, which only its author sees anyway', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia({ visibility: 'private' }));
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(false);
	});

	it('is no surprise when an older command says nothing about it', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia({ hiddenFromRecipient: undefined }));
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(false);
	});
});

describe('editing a surprise', () => {
	const edit = (actor: typeof ANDY, giftId: string, overrides: Partial<AddGiftInput> = {}) => {
		const { state: _state, ...content } = forJulia(overrides);
		return editGift(deps, actor, { ...content, giftId });
	};

	it('lets its author lift it, and keeps it as it was when the edit says nothing', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia());
		await edit(ANDY, giftId, { hiddenFromRecipient: undefined, title: 'Ring' });
		expect(gifts.rows.get(giftId)).toMatchObject({ title: 'Ring', hiddenFromRecipient: true });
		await edit(ANDY, giftId, { hiddenFromRecipient: false });
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(false);
	});

	it('leaves the choice to its author: another member’s edit neither lifts nor sets it', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia());
		const bob = { userId: 'bob', householdId: 'h1' };
		await edit(bob, giftId, { hiddenFromRecipient: false });
		expect(gifts.rows.get(giftId)?.hiddenFromRecipient).toBe(true);
	});

	it('is lifted when its author makes it private', async () => {
		const { giftId } = await addGift(deps, ANDY, forJulia());
		await edit(ANDY, giftId, { visibility: 'private' });
		expect(gifts.rows.get(giftId)).toMatchObject({
			visibility: 'private',
			hiddenFromRecipient: false
		});
	});

	it('is refused when the member it is for asks to keep their own gift from themselves', async () => {
		const { giftId } = await addGift(deps, JULIA, forJulia({ hiddenFromRecipient: false }));
		expect(await refusal(edit(JULIA, giftId))).toBe(
			'You cannot keep a gift from yourself — it is for you.'
		);
	});
});
