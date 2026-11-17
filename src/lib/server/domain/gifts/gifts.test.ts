import { beforeEach, describe, expect, it } from 'bun:test';
import type { PartialDate } from '../../../dates/partial-date';
import { inEnglish } from '../../../i18n/phrase';
import { ContactGoneError } from '../contacts/require-visible';
import {
	addGift,
	answerIdeaWhen,
	countOpenIdeas,
	editGift,
	GiftGoneError,
	ideaWaits,
	InvalidGiftError,
	listGiftsForContact,
	listOpenIdeas,
	markGiftGiven,
	removeGift,
	type GiftDeps
} from './gifts';
import { fakeGifts } from './gifts.fixture';

/*
 * The gift use-cases (docs/dev/02 §2.25), over an in-memory port. What the database scopes — a
 * private gift reaching only its author, a gift on a person the viewer cannot see — is the
 * Drizzle adapter's to prove (`db/gift-repository.test.ts`); here the fake keeps the same rule
 * so the use-cases can be seen relying on it.
 */

const ANDY = { userId: 'andy', householdId: 'h1' };
const JULIA = { userId: 'julia', householdId: 'h1' };
const HILDE = 'hilde';

let gifts: ReturnType<typeof fakeGifts>;
let deps: GiftDeps;
let now: number;
let counter: number;
let hildeBirth: PartialDate | null;

beforeEach(() => {
	gifts = fakeGifts(() => hildeBirth);
	now = Date.UTC(2026, 9, 8, 9);
	counter = 0;
	hildeBirth = { value: '2018-03-14', precision: 'full' };
	deps = {
		gifts,
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				if (id !== HILDE) return null;
				return {
					id,
					birthDate: hildeBirth?.value ?? null,
					birthDatePrecision: hildeBirth?.precision ?? 'full'
				} as never;
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
			hiddenFromRecipient: false,
			state: 'idea',
			title: 'Teapot',
			note: null,
			url: null,
			givenOn: null,
			occasion: null,
			when: null,
			whenCheckedOn: null,
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

describe('an idea for later', () => {
	// The household's day is 2026-10-08; Hilde turns 9 on 2027-03-14.
	it('keeps when an idea is for, as asked', async () => {
		const forTen = await addGift(deps, ANDY, { ...idea(), when: { kind: 'at_age', age: 10 } });
		const forXmas = await addGift(deps, ANDY, {
			...idea(),
			when: { kind: 'on_date', on: '2026-12-24' }
		});
		expect(gifts.rows.get(forTen.giftId)?.when).toEqual({ kind: 'at_age', age: 10 });
		expect(gifts.rows.get(forXmas.giftId)?.when).toEqual({ kind: 'on_date', on: '2026-12-24' });
	});

	it('takes an age already reached as now, and an old command without a when as now', async () => {
		const reached = await addGift(deps, ANDY, { ...idea(), when: { kind: 'from_age', age: 6 } });
		const old = await addGift(deps, ANDY, idea());
		expect(gifts.rows.get(reached.giftId)?.when).toBeNull();
		expect(gifts.rows.get(old.giftId)?.when).toBeNull();
	});

	it('refuses a birthday or a day already over', async () => {
		expect(
			await refusal(addGift(deps, ANDY, { ...idea(), when: { kind: 'at_age', age: 8 } }))
		).toBe('That birthday is over. Choose a later one.');
		expect(
			await refusal(addGift(deps, ANDY, { ...idea(), when: { kind: 'on_date', on: '2026-10-07' } }))
		).toBe('That day is over. Choose one still ahead.');
	});

	it('refuses an age for someone whose birth year nobody knows', async () => {
		hildeBirth = { value: '--03-14', precision: 'month_day' };
		expect(
			await refusal(addGift(deps, ANDY, { ...idea(), when: { kind: 'at_age', age: 10 } }))
		).toBe('An age needs their birth year, or an estimate of it.');
	});

	it('gives a given gift no when, and drops it once an idea is given', async () => {
		const given = await addGift(deps, ANDY, {
			...idea(),
			state: 'given',
			givenOn: '2026-10-01',
			when: { kind: 'later' }
		});
		expect(gifts.rows.get(given.giftId)?.when).toBeNull();

		const later = await addGift(deps, ANDY, { ...idea(), when: { kind: 'later' } });
		await markGiftGiven(deps, ANDY, {
			contactId: HILDE,
			giftId: later.giftId,
			givenOn: '2026-10-08',
			occasion: null
		});
		expect(gifts.rows.get(later.giftId)?.when).toBeNull();
	});

	it('keeps a when left as it was on edit, even once over, but checks a new one', async () => {
		const { giftId } = await addGift(deps, ANDY, {
			...idea(),
			when: { kind: 'on_date', on: '2026-12-24' }
		});
		now = Date.UTC(2027, 0, 10, 9);
		await editGift(deps, ANDY, { ...idea('Renamed'), giftId });
		await editGift(deps, ANDY, {
			...idea('Again'),
			giftId,
			when: { kind: 'on_date', on: '2026-12-24' }
		});
		expect(gifts.rows.get(giftId)?.when).toEqual({ kind: 'on_date', on: '2026-12-24' });
		expect(
			await refusal(
				editGift(deps, ANDY, { ...idea(), giftId, when: { kind: 'on_date', on: '2027-01-01' } })
			)
		).toBe('That day is over. Choose one still ahead.');
		await editGift(deps, ANDY, { ...idea(), giftId, when: null });
		expect(gifts.rows.get(giftId)?.when).toBeNull();
	});

	it('leaves an idea that still waits out of the counts, and lists it last, soonest first', async () => {
		await addGift(deps, ANDY, { ...idea('Some day'), when: { kind: 'later' } });
		await addGift(deps, ANDY, idea('Now'));
		await addGift(deps, ANDY, {
			...idea('Christmas'),
			when: { kind: 'on_date', on: '2026-12-24' }
		});
		await addGift(deps, ANDY, { ...idea('At ten'), when: { kind: 'at_age', age: 10 } });

		const viewer = { id: 'andy', householdId: 'h1' };
		expect([...(await countOpenIdeas(deps, viewer, [HILDE]))]).toEqual([[HILDE, 2]]);
		const listed = await listOpenIdeas(deps, viewer);
		expect(listed.map((g) => [g.title, g.whenState?.kind ?? null])).toEqual([
			['Now', null],
			['Christmas', 'soon'],
			['At ten', 'waiting'],
			['Some day', 'waiting']
		]);
		expect(listed[0]).not.toHaveProperty('birth');
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

describe('ideaWaits', () => {
	const noted = { whenCheckedOn: null, createdAt: Date.parse('2026-10-07T12:00:00Z') };
	const today = '2026-10-07';
	it('tells an idea still waiting for its day or for later from one due now', () => {
		expect(ideaWaits({ state: 'idea', when: { kind: 'later' }, ...noted }, null, today)).toBe(true);
		expect(
			ideaWaits(
				{ state: 'idea', when: { kind: 'on_date', on: '2027-06-01' }, ...noted },
				null,
				today
			)
		).toBe(true);
		expect(
			ideaWaits(
				{ state: 'idea', when: { kind: 'on_date', on: '2026-12-24' }, ...noted },
				null,
				today
			)
		).toBe(false);
		expect(ideaWaits({ state: 'idea', when: null, ...noted }, null, today)).toBe(false);
	});

	it('never holds back a gift already given', () => {
		expect(ideaWaits({ state: 'given', when: { kind: 'later' }, ...noted }, null, today)).toBe(
			false
		);
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
		const counting = gifts.listOpenIdeaWhensVisibleTo.bind(gifts);
		gifts.listOpenIdeaWhensVisibleTo = async (viewer, ids) => {
			asked = ids;
			return counting(viewer, ids);
		};
		const counts = await countOpenIdeas(deps, { id: 'andy', householdId: 'h1' }, [HILDE, HILDE]);
		expect([...counts]).toEqual([[HILDE, 2]]);
		expect(asked).toEqual([HILDE]);
	});
});

describe('listOpenIdeas', () => {
	it('lists the open ideas the viewer may see, never a gift already given', async () => {
		await addGift(deps, ANDY, idea('Teapot'));
		await addGift(deps, JULIA, { ...idea('Hers'), visibility: 'private' });
		const given = await addGift(deps, ANDY, idea('Book'));
		await markGiftGiven(deps, ANDY, {
			contactId: HILDE,
			giftId: given.giftId,
			givenOn: '2026-10-01',
			occasion: null
		});

		const listed = await listOpenIdeas(deps, { id: 'andy', householdId: 'h1' });
		expect(listed.map((g) => [g.title, g.contactName])).toEqual([['Teapot', HILDE]]);
	});

	it('lists an idea come due, or whose day went by, with where it stands', async () => {
		await addGift(deps, ANDY, { ...idea('Sled'), when: { kind: 'on_date', on: '2026-12-24' } });
		await addGift(deps, ANDY, { ...idea('Bike'), when: { kind: 'at_age', age: 10 } });
		const viewer = { id: 'andy', householdId: 'h1' };
		expect((await listOpenIdeas(deps, viewer)).map((g) => [g.title, g.whenState])).toEqual([
			['Sled', { kind: 'soon', on: '2026-12-24', approximate: false, inDays: 77 }],
			['Bike', { kind: 'waiting' }]
		]);
		now = Date.UTC(2027, 0, 10, 9);
		expect((await listOpenIdeas(deps, viewer)).map((g) => g.whenState?.kind)).toEqual([
			'passed',
			'waiting'
		]);
		expect([...(await countOpenIdeas(deps, viewer, [HILDE]))]).toEqual([[HILDE, 1]]);
	});
});

describe('answerIdeaWhen', () => {
	// The household's day is 2026-10-08; Hilde turns 9 on 2027-03-14.
	const passedChristmas = async () => {
		const { giftId } = await addGift(deps, ANDY, {
			...idea(),
			when: { kind: 'on_date', on: '2026-12-24' }
		});
		now = Date.UTC(2027, 0, 10, 9);
		return giftId;
	};

	it('keeps an idea whose day went by as a plain one, noting the answer', async () => {
		const giftId = await passedChristmas();
		await answerIdeaWhen(deps, JULIA, { contactId: HILDE, giftId, when: null });
		expect(gifts.rows.get(giftId)).toMatchObject({ when: null, whenCheckedOn: '2027-01-10' });
	});

	it('moves it to a new time, checked like any other', async () => {
		const giftId = await passedChristmas();
		await answerIdeaWhen(deps, ANDY, {
			contactId: HILDE,
			giftId,
			when: { kind: 'at_age', age: 10 }
		});
		expect(gifts.rows.get(giftId)?.when).toEqual({ kind: 'at_age', age: 10 });
		expect(
			await refusal(
				answerIdeaWhen(deps, ANDY, {
					contactId: HILDE,
					giftId,
					when: { kind: 'on_date', on: '2027-01-09' }
				})
			)
		).toBe('That day is over. Choose one still ahead.');
	});

	it('keeps later as later, asked again only next year', async () => {
		const { giftId } = await addGift(deps, ANDY, { ...idea(), when: { kind: 'later' } });
		now = Date.UTC(2026, 11, 20, 9);
		await answerIdeaWhen(deps, ANDY, { contactId: HILDE, giftId, when: { kind: 'later' } });
		expect(gifts.rows.get(giftId)).toMatchObject({
			when: { kind: 'later' },
			whenCheckedOn: '2026-12-20'
		});
	});

	it('refuses a gift already given', async () => {
		const { giftId } = await addGift(deps, ANDY, {
			...idea(),
			state: 'given',
			givenOn: '2026-10-01'
		});
		expect(
			await refusal(answerIdeaWhen(deps, ANDY, { contactId: HILDE, giftId, when: null }))
		).toBe('This gift was already given.');
	});

	it('counts a when chosen anew on edit as an answer, and one left as it was not', async () => {
		const { giftId } = await addGift(deps, ANDY, { ...idea(), when: { kind: 'later' } });
		now = Date.UTC(2026, 11, 20, 9);
		await editGift(deps, ANDY, { ...idea('Renamed'), giftId });
		expect(gifts.rows.get(giftId)?.whenCheckedOn).toBeNull();
		await editGift(deps, ANDY, { ...idea(), giftId, when: { kind: 'at_age', age: 10 } });
		expect(gifts.rows.get(giftId)?.whenCheckedOn).toBe('2026-12-20');
	});
});
