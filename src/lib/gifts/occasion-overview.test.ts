import { describe, expect, it } from 'bun:test';
import { occasionOverview, type OverviewGift } from './occasion-overview';

const gift = (id: string, over: Partial<OverviewGift> = {}): OverviewGift => ({
	id,
	contactId: 'tomy',
	contactName: 'Tomy',
	avatarPhotoId: null,
	title: id,
	state: 'idea',
	on: '2026-12-24',
	giver: { kind: 'none' },
	hiddenFromRecipient: false,
	...over
});

describe('occasionOverview', () => {
	it('lists the occasions soonest first and the undated assigned ones last', () => {
		const groups = occasionOverview([
			gift('a', { on: '2027-03-14' }),
			gift('b', { on: null, giver: { kind: 'household' } }),
			gift('c', { on: '2026-12-24' })
		]);
		expect(groups.map((group) => group.on)).toEqual(['2026-12-24', '2027-03-14', null]);
	});

	it('keeps an undated gift out unless somebody gives it or it is bought', () => {
		const groups = occasionOverview([
			gift('free', { on: null }),
			gift('taken', { on: null, giver: { kind: 'household' } }),
			gift('done', { on: null, state: 'bought' })
		]);
		expect(groups[0]?.recipients[0]?.gifts.map((g) => g.id)).toEqual(['taken', 'done']);
	});

	it('has one block per recipient, by name, taken before free before bought', () => {
		const [group] = occasionOverview([
			gift('bought', { state: 'bought' }),
			gift('free'),
			gift('taken', { giver: { kind: 'household' } }),
			gift('ben', { contactId: 'ben', contactName: 'Ben' })
		]);
		expect(group?.recipients.map((r) => r.contactName)).toEqual(['Ben', 'Tomy']);
		expect(group?.recipients[1]?.gifts.map((g) => g.id)).toEqual(['taken', 'free', 'bought']);
	});

	it('tallies each recipient and the occasion', () => {
		const [group] = occasionOverview([
			gift('a', { giver: { kind: 'household' } }),
			gift('b'),
			gift('c', { contactId: 'ben', contactName: 'Ben', state: 'bought' })
		]);
		expect(group?.tally).toEqual({ done: 1, assigned: 1, free: 1 });
		expect(group?.recipients.map((r) => r.tally)).toEqual([
			{ done: 1, assigned: 0, free: 0 },
			{ done: 0, assigned: 1, free: 1 }
		]);
	});

	it('is empty when nothing is planned', () => {
		expect(occasionOverview([])).toEqual([]);
	});
});
