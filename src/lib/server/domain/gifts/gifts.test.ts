import { beforeEach, describe, expect, it } from 'bun:test';
import { inEnglish } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import { ContactGoneError } from '../contacts/require-visible';
import {
	addGift,
	countOpenIdeas,
	editGift,
	GiftGoneError,
	InvalidGiftError,
	listGiftsForContact,
	markGiftGiven,
	removeGift,
	type Gift,
	type GiftDeps,
	type GiftRepository
} from './gifts';

/*
 * The gift use-cases (docs/02 §2.25), over an in-memory port. What the database scopes — a
 * private gift reaching only its author, a gift on a person the viewer cannot see — is the
 * Drizzle adapter's to prove (`db/gift-repository.test.ts`); here the fake keeps the same rule
 * so the use-cases can be seen relying on it.
 */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const HILDE = 'hilde';

function fakeGifts(): GiftRepository & { rows: Map<string, Gift> } {
	const rows = new Map<string, Gift>();
	const visible = (viewer: Viewer, gift: Gift) =>
		gift.visibility === 'shared' || gift.createdBy === viewer.id;
	return {
		rows,
		async insert(gift) {
			rows.set(gift.id, { ...gift });
		},
		async findVisibleTo(viewer, contactId, giftId) {
			const gift = rows.get(giftId);
			return gift && gift.contactId === contactId && visible(viewer, gift) ? { ...gift } : null;
		},
		async update(gift) {
			rows.set(gift.id, { ...gift });
		},
		async remove(giftId) {
			rows.delete(giftId);
		},
		async listForContactVisibleTo(viewer, contactId) {
			return [...rows.values()].filter((g) => g.contactId === contactId && visible(viewer, g));
		},
		async listStoryPageForContactVisibleTo() {
			return [];
		},
		async countOpenIdeasVisibleTo(viewer, contactIds) {
			const counts = new Map<string, number>();
			for (const g of rows.values()) {
				if (g.state !== 'idea' || !contactIds.includes(g.contactId) || !visible(viewer, g))
					continue;
				counts.set(g.contactId, (counts.get(g.contactId) ?? 0) + 1);
			}
			return counts;
		}
	};
}

let gifts: ReturnType<typeof fakeGifts>;
let deps: GiftDeps;
let now: number;
let counter: number;

beforeEach(() => {
	gifts = fakeGifts();
	now = Date.UTC(2026, 9, 8, 9);
	counter = 0;
	deps = {
		gifts,
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				return id === HILDE ? ({ id } as never) : null;
			}
		},
		ids: { next: () => `gift-${++counter}` },
		clock: { now: () => now }
	};
});

const idea = (title = 'Teapot, cast iron') => ({
	contactId: HILDE,
	state: 'idea' as const,
	title,
	note: null,
	url: null,
	givenOn: null,
	occasion: null,
	visibility: 'shared' as const
});

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidGiftError || error instanceof GiftGoneError)
			return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('addGift', () => {
	it('notes an idea with only a title, by its author, shared', async () => {
		const { giftId } = await addGift(deps, ANDY, idea('  Teapot  '));
		expect(gifts.rows.get(giftId)).toEqual({
			id: giftId,
			contactId: HILDE,
			createdBy: 'andy',
			visibility: 'shared',
			state: 'idea',
			title: 'Teapot',
			note: null,
			url: null,
			givenOn: null,
			occasion: null,
			createdAt: now,
			updatedAt: now
		});
	});

	it('keeps no day or occasion on an idea: those are asked when it is given', async () => {
		const { giftId } = await addGift(deps, ANDY, {
			...idea(),
			givenOn: '2026-10-01',
			occasion: 'birthday'
		});
		expect(gifts.rows.get(giftId)).toMatchObject({ givenOn: null, occasion: null });
	});

	it('records a given or received gift on its day, with its occasion', async () => {
		const given = await addGift(deps, ANDY, {
			...idea('Slippers'),
			state: 'given',
			givenOn: '2024-12-24',
			occasion: 'christmas'
		});
		const received = await addGift(deps, ANDY, {
			...idea('Knitted socks'),
			state: 'received',
			givenOn: '2025-12-24',
			occasion: '  Housewarming '
		});
		expect(gifts.rows.get(given.giftId)).toMatchObject({
			state: 'given',
			givenOn: '2024-12-24',
			occasion: 'christmas'
		});
		expect(gifts.rows.get(received.giftId)).toMatchObject({
			state: 'received',
			occasion: 'Housewarming'
		});
	});

	it('keeps a note and a shop link, reading a bare address as a web one', async () => {
		const { giftId } = await addGift(deps, ANDY, {
			...idea(),
			note: ' The black one ',
			url: 'shop.example/teapot'
		});
		expect(gifts.rows.get(giftId)).toMatchObject({
			note: 'The black one',
			url: 'https://shop.example/teapot'
		});
	});

	it('refuses a gift without a title', async () => {
		expect(await refusal(addGift(deps, ANDY, idea('   ')))).toBe('A gift needs a name.');
		expect(gifts.rows.size).toBe(0);
	});

	it('refuses a link that is not a web address', async () => {
		expect(await refusal(addGift(deps, ANDY, { ...idea(), url: 'javascript:alert(1)' }))).toBe(
			'The link must be a web address.'
		);
	});

	it('refuses a given gift without a real day', async () => {
		expect(await refusal(addGift(deps, ANDY, { ...idea(), state: 'given' }))).toBe(
			'Please choose the day.'
		);
		expect(
			await refusal(addGift(deps, ANDY, { ...idea(), state: 'given', givenOn: '2025-02-30' }))
		).toBe('There is no 2025-02-30.');
	});

	it('refuses a gift for someone the author cannot see', async () => {
		await expect(addGift(deps, ANDY, { ...idea(), contactId: 'nobody' })).rejects.toBeInstanceOf(
			ContactGoneError
		);
	});
});

describe('markGiftGiven', () => {
	it('turns the idea into the given gift, keeping what it said', async () => {
		const { giftId } = await addGift(deps, JULIA, {
			...idea(),
			note: 'The black one',
			url: 'https://shop.example'
		});
		now += 1000;
		await markGiftGiven(deps, ANDY, {
			contactId: HILDE,
			giftId,
			givenOn: '2026-10-18',
			occasion: 'birthday'
		});
		expect(gifts.rows.get(giftId)).toMatchObject({
			state: 'given',
			title: 'Teapot, cast iron',
			note: 'The black one',
			url: 'https://shop.example',
			givenOn: '2026-10-18',
			occasion: 'birthday',
			createdBy: 'julia',
			updatedAt: now
		});
	});

	it('refuses a gift that is no longer an idea', async () => {
		const { giftId } = await addGift(deps, ANDY, idea());
		const day = { contactId: HILDE, giftId, givenOn: '2026-10-18', occasion: null };
		await markGiftGiven(deps, ANDY, day);
		expect(await refusal(markGiftGiven(deps, ANDY, day))).toBe('This gift was already given.');
	});

	it('refuses an idea the member cannot see', async () => {
		const { giftId } = await addGift(deps, JULIA, { ...idea(), visibility: 'private' });
		expect(
			await refusal(
				markGiftGiven(deps, ANDY, {
					contactId: HILDE,
					giftId,
					givenOn: '2026-10-18',
					occasion: null
				})
			)
		).toBe('This gift is no longer there.');
	});
});

describe('editGift', () => {
	it('rewrites what a gift says, keeping its state and author', async () => {
		const { giftId } = await addGift(deps, JULIA, {
			...idea('Slippers'),
			state: 'given',
			givenOn: '2024-12-24',
			occasion: 'christmas'
		});
		await editGift(deps, ANDY, {
			contactId: HILDE,
			giftId,
			title: 'Warm slippers',
			note: 'Size 39',
			url: null,
			givenOn: '2024-12-23',
			occasion: null,
			visibility: 'shared'
		});
		expect(gifts.rows.get(giftId)).toMatchObject({
			state: 'given',
			createdBy: 'julia',
			title: 'Warm slippers',
			note: 'Size 39',
			givenOn: '2024-12-23',
			occasion: null
		});
	});

	it('lets only its author make a gift private, so nobody hides someone else’s', async () => {
		const { giftId } = await addGift(deps, JULIA, idea());
		const edit = { ...idea(), giftId, visibility: 'private' as const };
		await editGift(deps, ANDY, edit);
		expect(gifts.rows.get(giftId)?.visibility).toBe('shared');
		await editGift(deps, JULIA, edit);
		expect(gifts.rows.get(giftId)?.visibility).toBe('private');
	});

	it('keeps an idea without a day', async () => {
		const { giftId } = await addGift(deps, ANDY, idea());
		await editGift(deps, ANDY, { ...idea('Teapot'), giftId, givenOn: '2026-01-01' });
		expect(gifts.rows.get(giftId)).toMatchObject({ title: 'Teapot', givenOn: null });
	});

	it('refuses a given gift left without a day', async () => {
		const { giftId } = await addGift(deps, ANDY, {
			...idea(),
			state: 'given',
			givenOn: '2024-12-24'
		});
		expect(await refusal(editGift(deps, ANDY, { ...idea(), giftId, givenOn: null }))).toBe(
			'Please choose the day.'
		);
	});
});

describe('removeGift', () => {
	it('removes a gift anyone who can see it removes', async () => {
		const { giftId } = await addGift(deps, JULIA, idea());
		await removeGift(deps, ANDY, { contactId: HILDE, giftId });
		expect(gifts.rows.size).toBe(0);
	});

	it('refuses a gift the member cannot see', async () => {
		const { giftId } = await addGift(deps, JULIA, { ...idea(), visibility: 'private' });
		expect(await refusal(removeGift(deps, ANDY, { contactId: HILDE, giftId }))).toBe(
			'This gift is no longer there.'
		);
		expect(gifts.rows.size).toBe(1);
	});
});

describe('listGiftsForContact', () => {
	it('lists what the viewer may see', async () => {
		await addGift(deps, ANDY, idea('Mine'));
		await addGift(deps, JULIA, { ...idea('Hers'), visibility: 'private' });
		const listed = await listGiftsForContact(deps, { id: 'andy', householdId: 'h1' }, HILDE);
		expect(listed.map((g) => g.title)).toEqual(['Mine']);
	});
});

describe('countOpenIdeas', () => {
	it('counts the open ideas the viewer may see, once per person however often asked', async () => {
		await addGift(deps, ANDY, idea('Teapot'));
		await addGift(deps, ANDY, idea('Scarf'));
		await addGift(deps, JULIA, { ...idea('Hers'), visibility: 'private' });
		const given = await addGift(deps, ANDY, idea('Book'));
		await markGiftGiven(deps, ANDY, {
			contactId: HILDE,
			giftId: given.giftId,
			givenOn: '2026-10-01',
			occasion: null
		});

		let asked: readonly string[] = [];
		const counting = gifts.countOpenIdeasVisibleTo.bind(gifts);
		gifts.countOpenIdeasVisibleTo = async (viewer, ids) => {
			asked = ids;
			return counting(viewer, ids);
		};
		const counts = await countOpenIdeas(deps, { id: 'andy', householdId: 'h1' }, [HILDE, HILDE]);
		expect([...counts]).toEqual([[HILDE, 2]]);
		expect(asked).toEqual([HILDE]);
	});
});
