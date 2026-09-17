import { describe, expect, it } from 'bun:test';
import { segmentsOf, textOf, type LinkedSentence } from './linked';

/*
 * A sentence that names people the reader can follow (docs/02 §2.4.1, §2.19).
 *
 * The sentence is written whole in each language and handed its names, never assembled from
 * pieces: English says "Otto is a parent of Fabio" where German says "Otto ist ein Elternteil
 * von Fabio", and a reason puts the same three people in a different order in each. So the
 * split cannot look for names in the text — it marks the slots, lets the language place them,
 * and reads back where they landed.
 */

const otto = { id: 'p-otto', name: 'Otto Meier' };
const fabio = { id: 'p-fabio', name: 'Fabio Meier' };
const lisa = { id: 'p-lisa', name: 'Lisa Meier' };

/** The reason, as English writes it. */
const english: LinkedSentence<'parent' | 'via' | 'child'> = {
	people: { parent: otto, via: fabio, child: lisa },
	say: (n) => `${n.parent} is a parent of ${n.via}, and ${n.via} and ${n.child} are siblings.`
};

/** The same reason, as German writes it — other words, other order. */
const german: LinkedSentence<'parent' | 'via' | 'child'> = {
	people: { parent: otto, via: fabio, child: lisa },
	say: (n) =>
		`${n.parent} ist ein Elternteil von ${n.via}, und ${n.via} und ${n.child} sind Geschwister.`
};

describe('segmentsOf', () => {
	it('puts each person where the sentence put them, with the words in between kept exactly', () => {
		expect(segmentsOf(english)).toEqual([
			{ person: otto },
			{ text: ' is a parent of ' },
			{ person: fabio },
			{ text: ', and ' },
			{ person: fabio },
			{ text: ' and ' },
			{ person: lisa },
			{ text: ' are siblings.' }
		]);
	});

	it('follows the other language to its own order', () => {
		expect(segmentsOf(german)).toEqual([
			{ person: otto },
			{ text: ' ist ein Elternteil von ' },
			{ person: fabio },
			{ text: ', und ' },
			{ person: fabio },
			{ text: ' und ' },
			{ person: lisa },
			{ text: ' sind Geschwister.' }
		]);
	});

	/*
	 * The slot is marked, never searched for. A household may hold a person whose name is a
	 * digit or a punctuation mark, and a split that looked for names would cut the sentence to
	 * pieces around them.
	 */
	it('does not go looking for names in the text', () => {
		const odd = { id: 'p-1', name: '1' };
		const segments = segmentsOf({
			people: { one: odd, other: lisa },
			say: (n) => `${n.one} and ${n.other} are siblings, 1 of 2 claims.`
		});
		expect(segments).toEqual([
			{ person: odd },
			{ text: ' and ' },
			{ person: lisa },
			{ text: ' are siblings, 1 of 2 claims.' }
		]);
	});

	it('leaves a sentence that names nobody as one piece of text', () => {
		expect(segmentsOf({ people: {}, say: () => 'Nothing follows from this.' })).toEqual([
			{ text: 'Nothing follows from this.' }
		]);
	});

	/* A language may leave a person out of the sentence; they simply get no link. */
	it('links only the people the sentence actually named', () => {
		expect(segmentsOf({ people: { parent: otto, child: lisa }, say: (n) => `Through ${n.child}.` })).toEqual([
			{ text: 'Through ' },
			{ person: lisa },
			{ text: '.' }
		]);
	});
});

describe('textOf', () => {
	it('is the sentence as it reads, for a title or a label that cannot hold links', () => {
		expect(textOf(english)).toBe(
			'Otto Meier is a parent of Fabio Meier, and Fabio Meier and Lisa Meier are siblings.'
		);
	});
});
