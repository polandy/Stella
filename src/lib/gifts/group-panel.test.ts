import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import {
	alsoFor,
	giftGroupPanelPath,
	panelOrder,
	opensGiftGroup,
	type PanelMember
} from './group-panel';

// The order of *Who has it?* and the card's *also for* line (docs/dev/02 §2.25.11).

const born = (value: string): PartialDate => ({ value, precision: 'full' });
const member = (contactId: string, over: Partial<PanelMember> = {}): PanelMember => ({
	contactId,
	name: contactId,
	birth: born('2022-01-20'),
	state: 'idea',
	givenOn: null,
	when: { kind: 'at_age', age: 5 },
	...over
});

describe('panelOrder', () => {
	it('puts who has it first, then the rest by the day it comes to for them', () => {
		const rows = panelOrder([
			member('lea', { birth: born('2023-12-28') }),
			member('later', { when: { kind: 'later' } }),
			member('mia'),
			member('ben', { state: 'given', givenOn: '2027-01-02', when: null }),
			member('now', { when: null }),
			member('ida', { state: 'given', givenOn: '2026-12-24', when: null })
		]);
		expect(rows.map((r) => r.contactId)).toEqual(['ida', 'ben', 'now', 'mia', 'lea', 'later']);
	});
});

describe('alsoFor', () => {
	it('names everyone else in the group, given or not', () => {
		const members = [member('mia'), member('ben', { state: 'given' }), member('lea')];
		expect(alsoFor(members, 'mia')).toEqual(['ben', 'lea']);
		expect(alsoFor([member('mia')], 'mia')).toEqual([]);
	});
});

describe('giftGroupPanelPath', () => {
	it('opens the group’s panel on the person’s Gifts card', () => {
		const path = giftGroupPanelPath('mia', 'gg 1');
		expect(path).toBe('/contacts/mia?group=gg%201#section-gifts');
		expect(opensGiftGroup(new URL(path, 'https://stella.test'))).toBe('gg 1');
		expect(opensGiftGroup(new URL('https://stella.test/contacts/mia#section-gifts'))).toBeNull();
	});
});
