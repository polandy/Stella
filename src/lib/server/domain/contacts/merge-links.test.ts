import { describe, expect, it } from 'bun:test';
import type { Endpoints } from '../../../relationships/endpoints';
import { linkAfterMerge } from './merge-links';

/*
 * Where a link of the record merged away lands (docs/02 §2.2, docs/03 §relationship): in the
 * survivor's stored order, so the unique index and the duplicate check see it from either end.
 * The adapter runs these rules in the merge's transaction; the SQL is covered there.
 */

const merging = { keepId: 'keep', mergedId: 'dup' };

describe('where a link of the merged record lands', () => {
	it('sorts a symmetric link whose third person sorts between the two', () => {
		// dup < elias < keep: a plain repoint would leave (keep, elias), unsorted.
		expect<Endpoints | null>(
			linkAfterMerge({ fromContactId: 'dup', toContactId: 'elias' }, merging, true)
		).toEqual({
			fromContactId: 'elias',
			toContactId: 'keep'
		});
	});

	it('sorts it from the other end too', () => {
		const otherWay = { keepId: 'dup', mergedId: 'keep' };
		expect<Endpoints | null>(
			linkAfterMerge({ fromContactId: 'elias', toContactId: 'keep' }, otherWay, true)
		).toEqual({ fromContactId: 'dup', toContactId: 'elias' });
	});

	it('leaves a symmetric link that is already in order as it is', () => {
		expect<Endpoints | null>(
			linkAfterMerge({ fromContactId: 'dup', toContactId: 'lena' }, merging, true)
		).toEqual({
			fromContactId: 'keep',
			toContactId: 'lena'
		});
	});

	it('never re-sorts a directed link: from stays the forward-label side', () => {
		expect<Endpoints | null>(
			linkAfterMerge({ fromContactId: 'dup', toContactId: 'elias' }, merging, false)
		).toEqual({
			fromContactId: 'keep',
			toContactId: 'elias'
		});
		expect<Endpoints | null>(
			linkAfterMerge({ fromContactId: 'lena', toContactId: 'dup' }, merging, false)
		).toEqual({
			fromContactId: 'lena',
			toContactId: 'keep'
		});
	});

	it('has nowhere to put a link between the two, which would point at one person', () => {
		expect<Endpoints | null>(
			linkAfterMerge({ fromContactId: 'dup', toContactId: 'keep' }, merging, true)
		).toBeNull();
		expect(
			linkAfterMerge({ fromContactId: 'keep', toContactId: 'dup' }, merging, false)
		).toBeNull();
	});

	it('refuses a link the merged record is not an end of', () => {
		expect(() =>
			linkAfterMerge({ fromContactId: 'lena', toContactId: 'elias' }, merging, true)
		).toThrow();
	});
});
