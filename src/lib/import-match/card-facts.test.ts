import { describe, expect, it } from 'bun:test';
import type { IncomingCard } from './card';
import { cardFacts } from './card-facts';

/*
 * What the review step lists of an incoming contact (docs/02 §2.16): the card's own side,
 * in the same shape as what *Same person* would add, so both sides read alike.
 */

const card: Omit<IncomingCard, 'hash'> = {
	key: 'anna-1',
	firstName: 'Anna',
	lastName: 'Example',
	displayName: 'Anna Example',
	nickname: 'Anni',
	company: 'Example AG',
	jobTitle: 'Engineer',
	birthday: { value: '--04-07', precision: 'month_day' },
	emails: [{ value: 'anna@example.org', label: { known: 'home' } }],
	phones: [{ value: '+41 79 000 00 01', label: { typed: 'Old school' } }],
	addresses: [{ value: 'Examplestrasse 1, 3007 Bern', label: null }],
	urls: [{ value: 'https://example.org', label: null }],
	tags: ['Family'],
	photo: 'inline'
};

describe('cardFacts', () => {
	it('lists the card the way a merge plan lists what it adds', () => {
		expect(cardFacts(card)).toEqual([
			{ kind: 'email', value: 'anna@example.org', label: { known: 'home' } },
			{ kind: 'phone', value: '+41 79 000 00 01', label: { typed: 'Old school' } },
			{ kind: 'address', value: 'Examplestrasse 1, 3007 Bern', label: null },
			{ kind: 'url', value: 'https://example.org', label: null },
			{ kind: 'birthday', date: { value: '--04-07', precision: 'month_day' } },
			{ kind: 'company', value: 'Example AG' },
			{ kind: 'jobTitle', value: 'Engineer' },
			{ kind: 'nickname', value: 'Anni' },
			{ kind: 'tag', name: 'Family' }
		]);
	});

	it('lists nothing for a card that only names someone', () => {
		expect(
			cardFacts({
				...card,
				nickname: null,
				company: null,
				jobTitle: null,
				birthday: null,
				emails: [],
				phones: [],
				addresses: [],
				urls: [],
				tags: [],
				photo: null
			})
		).toEqual([]);
	});
});
