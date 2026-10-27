import { describe, expect, it } from 'bun:test';
import type { IncomingCard, StellaPerson } from '../../../import-match/card';
import { englishWording } from './monica/wording.fixture';
import { cardsToReview, completionOf, isCompleting } from './review-cards';
import type { RememberedAnswer } from './source-links';

const card = (over: Partial<IncomingCard> = {}): IncomingCard => ({
	key: 'k-anna',
	hash: 'h1',
	firstName: 'Anna',
	lastName: 'Example',
	displayName: 'Anna Example',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: null,
	emails: [],
	phones: [],
	addresses: [],
	urls: [],
	tags: [],
	photo: null,
	...over
});

const person = (over: Partial<StellaPerson> = {}): StellaPerson => ({
	id: 'c-anna',
	firstName: 'Anna',
	lastName: 'Example',
	displayName: 'Anna Example',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: null,
	hasPhoto: false,
	fields: [],
	homeLines: [],
	tags: [],
	...over
});

const anna = person({ fields: [{ kind: 'email', value: 'anna@example.org' }] });
const bruno = person({
	id: 'c-bruno',
	firstName: 'Bruno',
	lastName: 'Other',
	displayName: 'Bruno Other'
});

describe('cardsToReview', () => {
	const strong = card({ key: 'strong', emails: [{ value: 'anna@example.org', label: null }] });
	const weak = card({
		key: 'weak',
		firstName: 'Bruno',
		lastName: 'Other',
		displayName: 'Bruno Other'
	});
	const none = card({ key: 'none', firstName: 'Nobody', lastName: null, displayName: 'Nobody' });

	it('asks about new cards, strong matches first, then weak, several and none', () => {
		const review = cardsToReview([none, weak, strong], new Map(), [anna, bruno]);

		expect(review.map((r) => [r.card.key, r.match.kind])).toEqual([
			['strong', 'strong'],
			['weak', 'weak'],
			['none', 'none']
		]);
		expect(review.every((r) => r.linkedTo === null)).toBe(true);
	});

	it('leaves out skipped, unchanged and out-of-reach cards, and asks again about a changed one', () => {
		const answers = new Map<string, RememberedAnswer>([
			['none', { state: 'skipped' }],
			['weak', { state: 'out-of-reach' }],
			['strong', { state: 'linked', personId: 'c-anna', cardHash: 'h1' }],
			['changed', { state: 'linked', personId: 'c-bruno', cardHash: 'old' }]
		]);
		const changed = card({ key: 'changed', firstName: 'Zed', lastName: null, displayName: 'Zed' });

		const review = cardsToReview([none, weak, strong, changed], answers, [anna, bruno]);

		expect(review).toHaveLength(1);
		expect(review[0]).toMatchObject({ card: { key: 'changed' }, linkedTo: 'c-bruno' });
	});
});

describe('completionOf', () => {
	let n = 0;
	const ctx = () => ({
		ids: { next: () => `id-${++n}` },
		now: 50,
		wording: englishWording,
		locale: 'en' as const
	});

	it('adds only the fields the person lacks, labelled in the member’s language, after theirs', () => {
		n = 0;
		const incoming = card({
			emails: [
				{ value: 'ANNA@example.org', label: null },
				{ value: 'anna@work.example', label: { known: 'work' } }
			],
			phones: [{ value: '+41 79 000 00 01', label: { typed: 'Signal' } }]
		});

		const completion = completionOf(incoming, anna, [], ctx());

		expect(completion.fields).toEqual([
			{
				id: 'id-1',
				contactId: 'c-anna',
				kind: 'email',
				label: 'Work',
				value: 'anna@work.example',
				meta: null,
				sortOrder: 1,
				createdAt: 50,
				updatedAt: 50
			},
			{
				id: 'id-2',
				contactId: 'c-anna',
				kind: 'phone',
				label: 'Signal',
				value: '+41 79 000 00 01',
				meta: null,
				sortOrder: 2,
				createdAt: 50,
				updatedAt: 50
			}
		]);
		expect(completion.set).toEqual({});
		expect(isCompleting(completion)).toBe(true);
	});

	it('fills empty profile fields and the birthday, and keeps a differing company out', () => {
		const incoming = card({
			nickname: 'Anni',
			company: 'Other AG',
			jobTitle: 'Engineer',
			birthday: { value: '--04-07', precision: 'month_day' }
		});

		const completion = completionOf(incoming, person({ company: 'Example AG' }), [], ctx());

		expect(completion.set).toEqual({
			nickname: 'Anni',
			// The nickname joins the shown name the parts make (docs/02 §2.2).
			displayName: 'Anna “Anni” Example',
			firstName: 'Anna',
			lastName: 'Example',
			jobTitle: 'Engineer',
			birthDate: '--04-07',
			birthDatePrecision: 'month_day'
		});
	});

	it('takes the card’s side of a conflict only when asked, and only of a real conflict', () => {
		const incoming = card({
			firstName: 'Annette',
			birthday: { value: '1990-04-07', precision: 'full' }
		});
		const held = person({ birthday: { value: '1991-04-07', precision: 'full' } });

		expect(completionOf(incoming, held, [], ctx()).set).toEqual({});
		expect(completionOf(incoming, held, ['firstName', 'birthday'], ctx()).set).toEqual({
			firstName: 'Annette',
			lastName: 'Example',
			nickname: null,
			displayName: 'Annette Example',
			birthDate: '1990-04-07',
			birthDatePrecision: 'full'
		});
		expect(completionOf(card(), held, ['lastName', 'birthday'], ctx()).set).toEqual({});
	});

	it('keeps a name the member chose when the parts change', () => {
		const chosen = person({ displayName: 'Oma Anna', lastName: null });

		expect(completionOf(card(), chosen, [], ctx()).set).toMatchObject({
			lastName: 'Example',
			displayName: 'Oma Anna'
		});
	});

	it('adds the groups the person is not tagged with, and the photo when they have none', () => {
		const incoming = card({ tags: ['Family', 'Climbing'], photo: 'inline' });

		const completion = completionOf(incoming, person({ tags: ['family'] }), [], ctx());

		expect(completion.tags.map((t) => t.name)).toEqual(['Climbing']);
		expect(completion.photo).toBe(true);
		expect(completionOf(incoming, person({ hasPhoto: true }), [], ctx()).photo).toBe(false);
	});

	it('is nothing for a card that says nothing new', () => {
		expect(isCompleting(completionOf(card(), anna, [], ctx()))).toBe(false);
	});
});
