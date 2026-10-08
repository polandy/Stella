import { describe, expect, it } from 'bun:test';
import { photoAfterKey } from './photo-walk';

/*
 * Walking the gallery from the open photo with the arrow keys (docs/02 §2.14). The arrows wrap
 * at either end, and they belong to a text field when one has focus: a caption being typed moves
 * its caret, never the photo out from under it (docs/05 §5.9).
 */

describe('photoAfterKey', () => {
	it('steps right and left through the gallery', () => {
		expect(photoAfterKey({ key: 'ArrowRight', at: 1, count: 4, typing: false })).toBe(2);
		expect(photoAfterKey({ key: 'ArrowLeft', at: 1, count: 4, typing: false })).toBe(0);
	});

	it('wraps around at either end', () => {
		expect(photoAfterKey({ key: 'ArrowRight', at: 3, count: 4, typing: false })).toBe(0);
		expect(photoAfterKey({ key: 'ArrowLeft', at: 0, count: 4, typing: false })).toBe(3);
	});

	it('leaves the arrows to a text field that has focus', () => {
		expect(photoAfterKey({ key: 'ArrowRight', at: 1, count: 4, typing: true })).toBeNull();
		expect(photoAfterKey({ key: 'ArrowLeft', at: 1, count: 4, typing: true })).toBeNull();
	});

	it('ignores every other key', () => {
		expect(photoAfterKey({ key: 'Enter', at: 1, count: 4, typing: false })).toBeNull();
		expect(photoAfterKey({ key: 'ArrowDown', at: 1, count: 4, typing: false })).toBeNull();
	});
});
