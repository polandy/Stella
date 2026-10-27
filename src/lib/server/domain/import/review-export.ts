import { readContactCards, type ContactCards } from './contact-cards';
import type { SourceExport } from './monica/monica-export';
import { readVCard } from './vcard';

/*
 * A vCard read both ways the matching review needs it (docs/02 §2.16): as cards to compare,
 * and as the export the import's own mapping turns a *New person* into. Both readers walk
 * the same cards in order, so card i is the i-th contact of the mapping.
 */

export interface ReviewExport extends ContactCards {
	exp: SourceExport;
	/** The import plan's contact id for each card key. */
	planIdOf: ReadonlyMap<string, string>;
}

export function readReviewExport(text: string): ReviewExport {
	const read = readContactCards(text);
	const exp = readVCard(text);
	if (exp.contacts.length !== read.cards.length) {
		throw new Error(
			`vCard readers disagree: ${read.cards.length} cards, ${exp.contacts.length} contacts`
		);
	}
	const planIdOf = new Map(
		read.cards.map((c, i) => [c.key, `vcard:contact:${exp.contacts[i]!.id}`])
	);
	return { ...read, exp, planIdOf };
}
