import { describe, expect, it } from 'bun:test';
import { segmentsOf, textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import { parentThroughSibling } from './reasons';

/*
 * The sentence a suggestion carries (docs/02 §2.19, docs/concepts/relationship-suggestions-
 * implementation.md §6).
 *
 * A parent claim follows from *two* facts — the parent is on record for one child, and that
 * child and this one are siblings — and the reason has to carry both. Naming only the sibling
 * pair, as it did, states a true thing that never mentions the person being offered, which is
 * the one name the reader is asking about.
 */

const en = createTranslator('en');
const de = createTranslator('de');

const otto = { id: 'p-otto', name: 'Otto Meier' };
const fabio = { id: 'p-fabio', name: 'Fabio Meier' };
const lisa = { id: 'p-lisa', name: 'Lisa Meier' };

describe('parentThroughSibling', () => {
	it('states both facts the claim follows from, in English', () => {
		expect(textOf(parentThroughSibling(otto, fabio, lisa)(en))).toBe(
			'Otto Meier is a parent of Fabio Meier, and Fabio Meier and Lisa Meier are siblings.'
		);
	});

	it('states them the way German states them', () => {
		expect(textOf(parentThroughSibling(otto, fabio, lisa)(de))).toBe(
			'Otto Meier ist ein Elternteil von Fabio Meier, und Fabio Meier und Lisa Meier sind Geschwister.'
		);
	});

	/*
	 * Every name in the sentence is a way to that person — including the sibling in the middle,
	 * who is named twice and is the same person both times.
	 */
	it('keeps every name followable, in both languages', () => {
		for (const t of [en, de]) {
			const people = segmentsOf(parentThroughSibling(otto, fabio, lisa)(t)).flatMap((segment) =>
				'person' in segment ? [segment.person.id] : []
			);
			expect(people).toEqual(['p-otto', 'p-fabio', 'p-fabio', 'p-lisa']);
		}
	});
});
