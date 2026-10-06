import { describe, expect, it } from 'bun:test';
import { offersTogether, stripViews, togetherCandidates, viewShown } from './together';

const tie = (
	typeKey: string,
	side: 'forward' | 'reverse' = 'forward',
	status: 'current' | 'former' = 'current'
) => ({
	otherContactId: `c-${typeKey}-${side}`,
	typeKey,
	side,
	status
});

describe('offersTogether', () => {
	it('is offered for a couple and for a parent and child, from either end', () => {
		for (const row of [
			tie('spouse'),
			tie('partner'),
			tie('parent_child'),
			tie('parent_child', 'reverse')
		]) {
			expect(offersTogether(row)).toBe(true);
		}
	});

	it('is not offered for any other tie, nor for a household’s own type', () => {
		for (const key of [
			'sibling',
			'grandparent_grandchild',
			'friend',
			'colleague',
			'cousin',
			'godparent-own-type'
		]) {
			expect(offersTogether(tie(key))).toBe(false);
		}
	});

	it('is not offered for a couple that has ended', () => {
		expect(offersTogether(tie('spouse', 'forward', 'former'))).toBe(false);
		expect(offersTogether(tie('parent_child', 'forward', 'former'))).toBe(false);
	});
});

describe('togetherCandidates', () => {
	it('asks about the couple and the parents and children, and the viewer’s own person, each once', () => {
		const ties = [
			{ ...tie('spouse'), otherContactId: 'c-bert' },
			{ ...tie('parent_child'), otherContactId: 'c-lena' },
			{ ...tie('friend'), otherContactId: 'c-tom' },
			{ ...tie('partner'), otherContactId: 'c-me' }
		];
		expect(togetherCandidates({ pageContactId: 'c-julia', selfContactId: 'c-me', ties })).toEqual([
			'c-me',
			'c-bert',
			'c-lena'
		]);
	});

	it('never asks about the page’s own person, and leaves the viewer out when they have no person', () => {
		expect(togetherCandidates({ pageContactId: 'c-me', selfContactId: 'c-me', ties: [] })).toEqual(
			[]
		);
		expect(togetherCandidates({ pageContactId: 'c-julia', selfContactId: null, ties: [] })).toEqual(
			[]
		);
	});
});

describe('stripViews', () => {
	const base = {
		pageContactId: 'c-julia',
		selfContactId: 'c-me',
		togetherWith: ['c-me', 'c-bert']
	};

	it('is the person’s own photos alone when nobody is linked to be seen with them', () => {
		expect(stripViews({ ...base, togetherWith: [], askedByRow: null })).toEqual([{ kind: 'own' }]);
	});

	it('offers *You and Julia* when the viewer’s own person is linked', () => {
		expect(stripViews({ ...base, askedByRow: null })).toEqual([
			{ kind: 'own' },
			{ kind: 'withYou', contactId: 'c-me' }
		]);
	});

	it('adds the pair a relationship row asked for', () => {
		expect(stripViews({ ...base, askedByRow: 'c-bert' })).toEqual([
			{ kind: 'own' },
			{ kind: 'withYou', contactId: 'c-me' },
			{ kind: 'withOther', contactId: 'c-bert' }
		]);
	});

	it('reads a row naming the viewer as *You and Julia*, not as a third view', () => {
		expect(stripViews({ ...base, askedByRow: 'c-me' })).toEqual([
			{ kind: 'own' },
			{ kind: 'withYou', contactId: 'c-me' }
		]);
	});

	it('offers nothing for someone not linked, and no *You and …* on the viewer’s own page', () => {
		expect(stripViews({ ...base, askedByRow: 'c-tom' })).toEqual([
			{ kind: 'own' },
			{ kind: 'withYou', contactId: 'c-me' }
		]);
		expect(
			stripViews({ ...base, pageContactId: 'c-me', togetherWith: ['c-bert'], askedByRow: null })
		).toEqual([{ kind: 'own' }]);
	});
});

describe('viewShown', () => {
	const views = [{ kind: 'own' }, { kind: 'withYou', contactId: 'c-me' }] as const;

	it('is the chosen pair when it is offered, else their own photos', () => {
		expect(viewShown(views, 'c-me')).toEqual({ kind: 'withYou', contactId: 'c-me' });
		expect(viewShown(views, 'c-tom')).toEqual({ kind: 'own' });
		expect(viewShown(views, null)).toEqual({ kind: 'own' });
	});
});
