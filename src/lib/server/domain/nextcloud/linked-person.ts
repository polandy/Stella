import type { CardField, CardLabel, KnownLabel, StellaPerson } from '../../../import-match/card';
import type { PersonOnCard } from './card-out';
import type { LinkedPerson } from './store';

/*
 * A linked person both ways a sync needs them (docs/02 §2.16.3): as the person a card is merged
 * against, and as what their card holds. Pure.
 */

/** The label words Stella writes the way every address book does (*Home*, *Work*, *Mobile*). */
export type KnownLabelOf = (text: string) => KnownLabel | null;

/** Pictures a phone shows; one in another format stays off the card. */
const CARD_MIMES = ['image/jpeg', 'image/png'];

export function asStellaPerson(p: LinkedPerson): StellaPerson {
	return {
		id: p.id,
		firstName: p.firstName,
		lastName: p.lastName,
		displayName: p.displayName,
		nickname: p.nickname,
		company: p.company,
		jobTitle: p.jobTitle,
		birthday: p.birthday,
		hasPhoto: p.hasPhoto,
		fields: p.fields.map(({ kind, value }) => ({ kind, value })),
		homeLines: p.homeLines,
		tags: p.tags
	};
}

/** The avatar a card gets, when it is one a phone shows. */
export const cardAvatar = (p: LinkedPerson): LinkedPerson['avatar'] =>
	p.avatar && CARD_MIMES.includes(p.avatar.mime) ? p.avatar : null;

export function onCard(p: LinkedPerson, knownLabel: KnownLabelOf): PersonOnCard {
	const label = (text: string | null): CardLabel | null => {
		if (text === null || text.trim() === '') return null;
		const known = knownLabel(text);
		return known ? { known } : { typed: text };
	};
	const fields = (kind: 'phone' | 'email' | 'address'): CardField[] =>
		p.fields.filter((f) => f.kind === kind).map((f) => ({ value: f.value, label: label(f.label) }));
	return {
		firstName: p.firstName,
		lastName: p.lastName,
		displayName: p.displayName,
		birthday: p.birthday,
		phones: fields('phone'),
		emails: fields('email'),
		// The household's home is where they live: it goes out as their home address.
		addresses: [
			...fields('address'),
			...p.homeLines.map((value): CardField => ({ value, label: { known: 'home' } }))
		],
		photoId: cardAvatar(p)?.photoId ?? null
	};
}
