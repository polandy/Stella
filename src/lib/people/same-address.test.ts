import { describe, expect, it } from 'bun:test';
import { foldAddress, isSameAddress } from './same-address';

describe('isSameAddress', () => {
	it('reads two lines as one address when only case, spaces and punctuation differ', () => {
		expect(isSameAddress('Lindenweg 4, 8800 Thalwil', 'lindenweg 4\n8800  THALWIL')).toBe(true);
		expect(isSameAddress('Lindenweg 4.', ' Lindenweg   4 ')).toBe(true);
	});

	it('keeps accents and spelling: only an exact match after folding counts (Q3)', () => {
		expect(isSameAddress('Zürichstrasse 1', 'Zurichstrasse 1')).toBe(false);
		expect(isSameAddress('Dorfstrasse 12', 'Dorfstr. 12')).toBe(false);
		expect(isSameAddress('Lindenweg 4', 'Lindenweg 41')).toBe(false);
	});

	it('never calls two blank lines the same address', () => {
		expect(isSameAddress('', ' , ')).toBe(false);
	});
});

describe('foldAddress', () => {
	it('joins the words of every line with one space', () => {
		expect(foldAddress('Lindenweg 4,\n8800 Thalwil')).toBe('lindenweg 4 8800 thalwil');
	});
});
