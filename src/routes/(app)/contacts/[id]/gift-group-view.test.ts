import { describe, expect, it } from 'bun:test';
import type { VisibleGiftGroup } from '#lib/server/domain/gifts/gift-groups.js';
import { NO_GIVER, type Gift } from '#lib/server/domain/gifts/gifts.js';
import { giftGroupView } from './gift-group-view';

// What *Who has it?* is handed for one group (docs/dev/02 §2.25.11).

const ctx = {
	viewerId: 'user-1',
	nameOf: () => null,
	nameOfAuthor: (id: string) => ({ 'user-2': 'Hans Brunner' })[id] ?? null
};

const gift = (contactId: string, over: Partial<Gift> = {}) => ({
	id: `g-${contactId}`,
	...NO_GIVER,
	storedAt: null,
	value: null,
	contactId,
	contactName: contactId,
	birth: { value: '2022-01-20', precision: 'full' as const },
	createdBy: 'user-2',
	visibility: 'shared' as const,
	hiddenFromRecipient: false,
	state: 'idea' as const,
	title: 'Puzzle',
	note: null,
	url: null,
	givenOn: null,
	occasion: null,
	when: { kind: 'at_age' as const, age: 5 },
	whenCheckedOn: null,
	groupId: 'gg',
	createdAt: 1,
	updatedAt: 1,
	...over
});

const found = (gifts: VisibleGiftGroup['gifts']): VisibleGiftGroup => ({
	group: {
		id: 'gg',
		householdId: 'h1',
		createdBy: 'user-2',
		title: 'Puzzle',
		note: 'blue box',
		url: null,
		when: { kind: 'at_age', age: 5 },
		occasion: 'birthday',
		visibility: 'shared',
		hiddenFromRecipients: false,
		createdAt: 1,
		updatedAt: 1
	},
	gifts
});

describe('giftGroupView', () => {
	it('says what the group notes, and who noted it', () => {
		const view = giftGroupView(found([gift('mia')]), ctx);
		expect(view).toMatchObject({
			id: 'gg',
			title: 'Puzzle',
			note: 'blue box',
			occasion: 'birthday',
			mine: false,
			notedBy: 'Hans'
		});
		expect(giftGroupView(found([]), { ...ctx, viewerId: 'user-2' }).mine).toBe(true);
	});

	it('lists each person with their gift, and marks an idea timed for them alone', () => {
		const view = giftGroupView(
			found([
				gift('mia'),
				gift('ben', { when: null, title: 'Blue puzzle' }),
				gift('lea', { state: 'given', givenOn: '2026-12-24', when: null })
			]),
			ctx
		);
		expect(view.members.map((m) => [m.name, m.state, m.ownWhen, m.ownTitle])).toEqual([
			['mia', 'idea', false, false],
			['ben', 'idea', true, true],
			['lea', 'given', false, false]
		]);
		expect(view.members[2]).toMatchObject({ giftId: 'g-lea', givenOn: '2026-12-24' });
	});
});
