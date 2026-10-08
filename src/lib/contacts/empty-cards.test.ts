import { describe, expect, it } from 'bun:test';
import { cardShape } from './empty-cards';
import { CONTACT_SECTIONS } from './sections';

/*
 * How a card of the person page stands while it holds nothing (docs/05 §5.5): most people in a
 * household are reference records, and four boxes that each say "nothing" teach the reader to
 * stop looking.
 */

describe('cardShape', () => {
	it('shows every card in full once it holds something', () => {
		for (const section of CONTACT_SECTIONS) expect(cardShape(section, true)).toBe('card');
	});

	it('shrinks empty Photos, Notes and Gifts to one line: title, a sentence, the add button', () => {
		expect(cardShape('photos', false)).toBe('line');
		expect(cardShape('notes', false)).toBe('line');
		expect(cardShape('gifts', false)).toBe('line');
	});

	it('leaves out an empty Mentioned in: it is passive, there is nothing to add there', () => {
		expect(cardShape('mentions', false)).toBe('absent');
	});

	it('keeps People and the story as cards: their empty states are where adding starts', () => {
		expect(cardShape('relationships', false)).toBe('card');
		expect(cardShape('story', false)).toBe('card');
	});
});
