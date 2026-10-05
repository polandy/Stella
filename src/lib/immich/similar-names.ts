import { foldName, type MatchableContact } from './match';
import { isInitial, isKinWord } from './newcomers';

/*
 * Who in Stella a face of *New from Immich* might already be (docs/02 §2.24.7). Before a person
 * is added from an Immich name, the member is shown the people of the same or a similar name, so
 * nobody is added twice — and nothing is decided for them, because two people of one name are
 * real. Pure: the use-case hands over the contacts the member sees.
 *
 * Similar means a given name agrees: a word of Immich's name is somebody's first name or
 * nickname (*Opa Manfred* ~ Manfred Pollari, *Jonas B.* ~ Jonas Bauer). A shared last name alone
 * is not enough — Tom Weber is not his brother Max — but it ranks a match higher (*Lena Köhler*
 * puts Lena Köhler-Brandt before Lena Müller). Kin words and initials say nothing about who it is.
 */

/** The most people the comparison step shows: past a handful, the face is the better guide. */
export const MAX_SIMILAR = 5;

const words = (value: string | null) => (value ? foldName(value).split(' ').filter(Boolean) : []);

/** The words of an Immich name that can say who it is. */
const tellingWords = (name: string) =>
	name
		.split(/\s+/)
		.filter((word) => word !== '' && !isKinWord(word) && !isInitial(word))
		.flatMap((word) => words(word));

/** The ids of the people a face named `immichName` might be, the closest first. */
export function similarPeople(immichName: string, contacts: readonly MatchableContact[]): string[] {
	const wanted = tellingWords(immichName);
	if (wanted.length === 0) return [];
	const byName = new Intl.Collator(undefined, { sensitivity: 'base' }).compare;

	const scored = contacts.flatMap((contact) => {
		// Someone known by a shown name alone is called by its first word.
		const given = new Set(
			[...words(contact.firstName), ...words(contact.nickname)].filter((word) => !isKinWord(word))
		);
		if (contact.firstName === null) given.add(words(contact.displayName)[0] ?? '');
		if (!wanted.some((word) => given.has(word))) return [];
		const all = new Set([...given, ...words(contact.lastName), ...words(contact.displayName)]);
		return [{ contact, score: wanted.filter((word) => all.has(word)).length }];
	});

	return scored
		.sort(
			(a, b) =>
				b.score - a.score ||
				byName(a.contact.displayName, b.contact.displayName) ||
				a.contact.id.localeCompare(b.contact.id)
		)
		.slice(0, MAX_SIMILAR)
		.map(({ contact }) => contact.id);
}
