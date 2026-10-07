import { splitTypedName } from '../people/new-person';
import { foldName, type MatchableImmichPerson } from './match';

/*
 * *New from Immich* — the other way round from *Find your people* (docs/02 §2.24.7): the
 * people Immich knows by name who have no Stella person yet,
 * so a member can add them. Pure: the use-case reads Immich, the links and the ignores, and this
 * decides who is new, in which order, and what name a new person starts with.
 *
 * "No Stella person yet" means nobody holds the face — not even someone the member cannot see,
 * whose link takes the face all the same (docs/04 ADR-096) — and *Find your people* proposes it for
 * nobody: a face whose name agrees with somebody's is theirs to confirm there, and offering it
 * here as well would put one person in both tabs.
 */

export interface NewcomerInput {
	people: readonly MatchableImmichPerson[];
	/** Faces linked to anyone, whether or not the member sees them. */
	heldPersonIds: ReadonlySet<string>;
	/** Faces *Find your people* proposes for someone the member sees. */
	proposedPersonIds: ReadonlySet<string>;
	/** Faces the household said are nobody to add. */
	ignoredPersonIds: ReadonlySet<string>;
}

/** One row of the list: a face in Immich, by the name Immich gives it. */
export interface ImmichNewcomer {
	personId: string;
	name: string;
}

const tidy = (name: string) => name.trim().replace(/\s+/g, ' ');

/**
 * The faces to offer, in the order Immich listed them (which puts the most photographed first,
 * but only roughly — `mostPhotosFirst` settles it once the counts are in). Two faces of one name
 * stay two rows.
 */
export function immichNewcomers(input: NewcomerInput): ImmichNewcomer[] {
	return input.people
		.filter(
			(p) =>
				!p.hidden &&
				!input.heldPersonIds.has(p.id) &&
				!input.proposedPersonIds.has(p.id) &&
				!input.ignoredPersonIds.has(p.id)
		)
		.map((p) => ({ personId: p.id, name: tidy(p.name) }))
		.filter((p) => p.name !== '');
}

/**
 * The rows with the most photos first: the people who matter most in the library come up first.
 * A face Immich would not count goes last; a tie is ordered by name, then by id, so the list
 * never reshuffles between two visits that saw the same library.
 */
export function mostPhotosFirst<
	T extends { personId: string; name: string; photoCount: number | null }
>(rows: readonly T[]): T[] {
	const byName = new Intl.Collator(undefined, { sensitivity: 'base' }).compare;
	return [...rows].sort(
		(a, b) =>
			(b.photoCount ?? -1) - (a.photoCount ?? -1) ||
			byName(a.name, b.name) ||
			a.personId.localeCompare(b.personId)
	);
}

/**
 * Words for a relative that people put in front of a name when they name a face — *Opa
 * Manfred*, *Aunt Rose*. They say who the person is to the family, which is what a nickname is
 * for in Stella (docs/02 §2.2), not part of their name. Compared folded, so case and accents do
 * not matter.
 */
const KIN_WORDS = new Set(
	[
		// German, and the Swiss forms a family uses
		'opa',
		'oma',
		'uropa',
		'uroma',
		'grossvater',
		'grossmutter',
		'grosi',
		'grospi',
		'neni',
		'tante',
		'onkel',
		'gotti',
		'götti',
		'gotte',
		'pate',
		'patin',
		'papa',
		'mama',
		'papi',
		'mami',
		'vati',
		'mutti',
		// English
		'grandpa',
		'grandma',
		'grandad',
		'granddad',
		'granny',
		'grandfather',
		'grandmother',
		'nana',
		'aunt',
		'auntie',
		'aunty',
		'uncle',
		'dad',
		'daddy',
		'mum',
		'mom',
		'mummy',
		'mommy',
		'godmother',
		'godfather'
	].map(foldName)
);

/** Whether a word, as written in a name, is a kin word like *Opa* or *Aunt*. */
export function isKinWord(word: string): boolean {
	return KIN_WORDS.has(foldName(word));
}

/** A single letter, with or without its full stop — *B.* in *Jonas B.* — which is no last name. */
export const isInitial = (word: string) => /^\p{L}\.?$/u.test(word);

/** The name a person added from Immich starts with; the member can change any of it. */
export interface NameFromImmich {
	firstName: string;
	lastName: string;
	nickname: string;
}

/**
 * The name a person added from Immich starts with. The first word is the first name and the rest
 * the last name, as when a name is typed into a picker (docs/02 §2.2.2) — `van der Berg` stays one
 * last name. A leading kin word becomes the nickname (*Opa Manfred*: Manfred, called Opa), unless
 * it is all there is; a trailing initial is dropped, since *B.* is not anybody's last name.
 */
export function newPersonFromImmichName(name: string): NameFromImmich {
	let words = tidy(name).split(' ').filter(Boolean);
	let nickname = '';
	if (words.length > 1 && isKinWord(words[0])) {
		nickname = words[0];
		words = words.slice(1);
	}
	if (words.length > 1 && isInitial(words[words.length - 1])) words = words.slice(0, -1);
	const { firstName, lastName } = splitTypedName(words.join(' '));
	return { firstName, lastName, nickname };
}
