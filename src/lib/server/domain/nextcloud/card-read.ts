import type { IncomingCard } from '../../../import-match/card';
import { readContactCards } from '../import/contact-cards';
import type { ImportPlan } from '../import/monica/plan';
import { VCardError } from '../import/vcard-lines';
import type { CardPicture } from './card-out';
import { cardPicture } from './card-photo';
import { photoPrint } from './sync-plan';

/* A card of the linked book as the sync and the conflict answers read it (docs/02 §2.16.3). */

/** The review writer's new people, of which a sync makes none. */
export const NOBODY_NEW: ImportPlan = {
	contacts: [],
	contactFields: [],
	relationshipTypes: [],
	relationships: [],
	notes: [],
	gifts: [],
	todos: [],
	interactions: [],
	tags: [],
	contactTags: [],
	photos: [],
	report: {
		counts: {
			contacts: 0,
			relationships: 0,
			relationshipTypes: 0,
			contactFields: 0,
			notes: 0,
			gifts: 0,
			todos: 0,
			interactions: 0,
			tags: 0,
			photos: 0
		},
		warnings: [],
		skipped: []
	}
};

/** One card as the review reads it; null when it does not read (it is then left alone). */
export function readCard(vcard: string): IncomingCard | null {
	try {
		return readContactCards(vcard).cards[0] ?? null;
	} catch (error) {
		if (error instanceof VCardError) return null;
		throw error;
	}
}

export const printOf = (picture: CardPicture | null) =>
	picture ? photoPrint(picture.base64) : null;

/** The facts a card holds of a person, to tell whether a rewrite changes anything. */
export function factsOf(vcard: string): string | null {
	const card = readCard(vcard);
	if (!card) return null;
	const { firstName, lastName, birthday, phones, emails, addresses } = card;
	return JSON.stringify([
		firstName,
		lastName,
		birthday,
		phones,
		emails,
		addresses,
		printOf(cardPicture(vcard))
	]);
}
