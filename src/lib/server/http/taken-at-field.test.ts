import { describe, expect, it } from 'bun:test';
import { takenAtField } from './taken-at-field';

/*
 * The capture date an upload form carries (docs/02 §2.14). Absent is normal; what is there is
 * handed on to be judged by the use-case, so a field that is not text is refused, not ignored.
 */

const form = (value?: string | Blob) => {
	const data = new FormData();
	if (value !== undefined) data.set('takenAt', value);
	return data;
};

describe('takenAtField', () => {
	it('is null when the picture said nothing', () => {
		expect(takenAtField(form())).toBeNull();
	});

	it('is the text the form carries', () => {
		expect(takenAtField(form('2019-05-03T00:30:15+02:00'))).toBe('2019-05-03T00:30:15+02:00');
	});

	it('turns a file in the field into text that will not read, so it is refused', () => {
		expect(takenAtField(form(new Blob(['2019'])))).toBe('');
	});
});
