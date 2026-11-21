import { describe, expect, it } from 'bun:test';
import { yearSpan } from './period';

describe('yearSpan', () => {
	it('names the years a link ran', () => {
		expect(yearSpan('2015-03-01', '2018-06-30')).toBe('2015–2018');
	});

	it('names one year when the link began and ended in it', () => {
		expect(yearSpan('2018-01-01', '2018-06-30')).toBe('2018');
	});

	it('says nothing for a span with only one end', () => {
		expect(yearSpan('2015-03-01', null)).toBeNull();
		expect(yearSpan(null, '2018-06-30')).toBeNull();
		expect(yearSpan(null, null)).toBeNull();
	});
});
