import { describe, expect, it } from 'bun:test';
import { claimKey, indexDismissals, pairKey, type Dismissal } from './claims';

/*
 * The dismissal log as the engine reads it (docs/concepts/relationship-suggestions.md §6.4).
 * Keyed by the claim — the relation and the unordered pair — because the household declines
 * a claim, not the rule that happened to surface it.
 */

describe('pairKey', () => {
	it('names a pair the same way from either end', () => {
		expect(pairKey('hans', 'lisa')).toBe(pairKey('lisa', 'hans'));
	});

	it('tells different pairs apart', () => {
		expect(pairKey('hans', 'lisa')).not.toBe(pairKey('hans', 'kurt'));
	});
});

describe('claimKey', () => {
	it('names one claim the same way from either end', () => {
		expect(claimKey('parent', 'wingkam', 'steve')).toBe(claimKey('parent', 'steve', 'wingkam'));
	});

	it('keeps two relations over one pair apart', () => {
		expect(claimKey('parent', 'a', 'b')).not.toBe(claimKey('sibling', 'a', 'b'));
	});
});

describe('indexDismissals', () => {
	const rows: Dismissal[] = [
		{ relation: 'parent', pairKey: 'steve wingkam', dismissedAt: 42, dismissedBy: 'u1' }
	];

	it('answers with who declined a claim and when', () => {
		expect(indexDismissals(rows)('parent', 'wingkam', 'steve')).toEqual({ at: 42, by: 'u1' });
	});

	it('answers null for a claim that was never declined', () => {
		expect(indexDismissals(rows)('sibling', 'wingkam', 'steve')).toBeNull();
		expect(indexDismissals([])('parent', 'wingkam', 'steve')).toBeNull();
	});
});
