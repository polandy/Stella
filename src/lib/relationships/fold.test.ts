import { describe, expect, it } from 'bun:test';
import { foldedLinkDetails } from './fold';

/* Where two rows are one link, what the kept row takes from the copy (docs/03 §relationship). */

describe('the details a folded link gives the kept one', () => {
	it('fills the kept row’s blank description and since date from the copy', () => {
		expect(
			foldedLinkDetails(
				{ description: null, sinceDate: null },
				{ description: 'met at uni', sinceDate: '2004-09-01' }
			)
		).toEqual({ description: 'met at uni', sinceDate: '2004-09-01' });
	});

	it('treats an empty description as blank', () => {
		expect(
			foldedLinkDetails({ description: '', sinceDate: null }, { description: 'x', sinceDate: null })
		).toEqual({ description: 'x' });
	});

	it('keeps what the kept link already says', () => {
		expect(
			foldedLinkDetails(
				{ description: 'neighbours', sinceDate: '1999-01-01' },
				{ description: 'met at uni', sinceDate: '2004-09-01' }
			)
		).toEqual({});
	});

	it('has nothing to give where the copy is blank too', () => {
		expect(
			foldedLinkDetails(
				{ description: null, sinceDate: null },
				{ description: '', sinceDate: null }
			)
		).toEqual({});
	});
});
