import type { Translate } from './translate';

/*
 * Sentences that name people the reader can follow (docs/02 §2.4.1, §2.19).
 *
 * A suggestion's claim and its reason each name two or three members of the household, and
 * every one of those names is a way to that person's page. The sentence still has to be
 * written whole in each language — English uses a genitive where German uses a dative
 * apposition, and the two put the same names in a different order — so it cannot be glued
 * together out of translated fragments with names in between.
 *
 * Instead the sentence is asked to say itself with *markers* standing in for the names. Where
 * the language put each marker is where that person landed, and what lies between markers is
 * the language's own words, kept exactly. Nothing here searches the sentence for a name: a
 * household may hold a person called `1`, and matching on names would cut the sentence apart
 * around every digit in it.
 */

/** Someone a sentence names, and the page that is theirs. */
export interface PersonRef {
	id: string;
	name: string;
}

/** One piece of a said sentence: the language's own words, or a person to follow. */
export type Segment = { readonly text: string } | { readonly person: PersonRef };

/**
 * A sentence in one language, with the people it names.
 *
 * `people` is keyed by role — `parent`, `via`, `child` — and `say` receives those same roles
 * with names in them, so a message's parameters and a sentence's slots are one and the same.
 */
export interface LinkedSentence<Slot extends string = string> {
	people: Readonly<Partial<Record<Slot, PersonRef>>>;
	say: (names: Record<Slot, string>) => string;
}

/**
 * A sentence waiting for a language, as `Phrase` is — but one whose names stay separable
 * after it has been said.
 */
export type LinkedPhrase<Slot extends string = string> = (t: Translate) => LinkedSentence<Slot>;

/*
 * The marker is a unit separator: a control character no name, message or translation can
 * carry — it cannot be typed, and every catalogue here is plain prose.
 */
const MARK = '';
const MARKED = /(\d+)/;
const marked = (slot: number) => `${MARK}${slot}${MARK}`;

/**
 * The sentence in the reader's language, cut into words and people.
 *
 * A person named twice — as the sibling in the middle of a reason is — becomes two links to
 * one page, because the sentence says their name twice and dropping one would make the other
 * read as somebody else.
 */
export function segmentsOf<Slot extends string>(sentence: LinkedSentence<Slot>): Segment[] {
	const slots = Object.keys(sentence.people) as Slot[];
	const markers = Object.fromEntries(slots.map((slot, index) => [slot, marked(index)]));
	const said = sentence.say(markers as Record<Slot, string>);

	// `split` on a capturing pattern hands back text and captures in turn, so the odd places
	// are the slots and the even ones the language's own words.
	return said
		.split(MARKED)
		.map((piece, place) => {
			if (piece === '') return null; // A marker at either end leaves an empty edge.
			if (place % 2 === 0) return { text: piece };
			const person = sentence.people[slots[Number(piece)]!];
			return person ? { person } : null;
		})
		.filter((segment): segment is Segment => segment !== null);
}

/** The sentence as it reads, for somewhere that cannot hold a link — a title, a log line. */
export function textOf<Slot extends string>(sentence: LinkedSentence<Slot>): string {
	const slots = Object.keys(sentence.people) as Slot[];
	const names = Object.fromEntries(slots.map((slot) => [slot, sentence.people[slot]!.name]));
	return sentence.say(names as Record<Slot, string>);
}
