import type { PartialDate } from '../dates/partial-date';
import { foldAddress } from '../people/same-address';
import type { CardField, CardLabel, IncomingCard, StellaPerson } from './card';
import { foldName, foldText, normaliseEmail, normalisePhone, samePhone } from './normalise';

/*
 * What *Same person* writes (docs/concepts/contact-sources.md §1.3): only what the person is
 * missing, compared the API import's way (docs/02 §2.16.1, *Fields complete, never change*).
 * A differing birthday or name is asked about; anything else that differs stays out, said so.
 */

export type FieldFactKind = 'email' | 'phone' | 'address' | 'url';

/** One thing the card would give the person. */
export type Fact =
	| { kind: FieldFactKind; value: string; label: CardLabel | null }
	| { kind: 'lastName' | 'nickname' | 'company' | 'jobTitle'; value: string }
	| { kind: 'birthday'; date: PartialDate }
	| { kind: 'photo' }
	| { kind: 'tag'; name: string };

/** Where card and person disagree; Stella's side stays unless the member takes the card's. */
export type Conflict =
	| { kind: 'firstName' | 'lastName'; stella: string; card: string }
	| { kind: 'birthday'; stella: PartialDate; card: PartialDate };

export interface MergePlan {
	add: Fact[];
	conflicts: Conflict[];
	/** What the card says differently and is not taken over: a company, a job, a nickname. */
	kept: Fact[];
}

/** A key per field value, so a value the person holds — or the card repeats — is not added. */
function fieldKeys(kind: FieldFactKind, value: string): string[] {
	if (kind === 'email') return [normaliseEmail(value)];
	if (kind === 'address') return [foldAddress(value)];
	return [foldText(value)];
}

function missingFields(kind: FieldFactKind, incoming: CardField[], held: string[]): Fact[] {
	if (kind === 'phone') {
		// A phone is held when it is the same number or one alike: the same number written
		// nationally on one side is not a second number.
		const known = held.map(normalisePhone);
		const added: Fact[] = [];
		for (const field of incoming) {
			const phone = normalisePhone(field.value);
			if (known.some((k) => samePhone(phone, k) !== 'different')) continue;
			known.push(phone);
			added.push({ kind, value: field.value, label: field.label });
		}
		return added;
	}
	const seen = new Set(held.flatMap((value) => fieldKeys(kind, value)));
	const added: Fact[] = [];
	for (const field of incoming) {
		const [key] = fieldKeys(kind, field.value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		added.push({ kind, value: field.value, label: field.label });
	}
	return added;
}

/** A birthday's month and day, whatever its precision; null when it names no day. */
const monthDay = (date: PartialDate): string | null =>
	date.precision === 'full'
		? date.value.slice(5)
		: date.precision === 'month_day'
			? date.value.slice(2)
			: null;

/** Whether the card's birthday says nothing the person's does not already say. */
const birthdayHeld = (stella: PartialDate, card: PartialDate) =>
	(stella.value === card.value && stella.precision === card.precision) ||
	(card.precision === 'month_day' &&
		stella.precision === 'full' &&
		monthDay(stella) === monthDay(card));

export function mergePlan(card: IncomingCard, person: StellaPerson): MergePlan {
	const add: Fact[] = [];
	const conflicts: Conflict[] = [];
	const kept: Fact[] = [];

	const heldValues = (kind: FieldFactKind) => [
		...person.fields.filter((f) => f.kind === kind).map((f) => f.value),
		...(kind === 'address' ? person.homeLines : [])
	];
	add.push(
		...missingFields('email', card.emails, heldValues('email')),
		...missingFields('phone', card.phones, heldValues('phone')),
		...missingFields('address', card.addresses, heldValues('address')),
		...missingFields('url', card.urls, heldValues('url'))
	);

	const sameName = (a: string, b: string) => foldName(a) === foldName(b);
	if (card.firstName && person.firstName && !sameName(card.firstName, person.firstName)) {
		conflicts.push({ kind: 'firstName', stella: person.firstName, card: card.firstName });
	}
	if (card.lastName && !person.lastName) add.push({ kind: 'lastName', value: card.lastName });
	else if (card.lastName && person.lastName && !sameName(card.lastName, person.lastName)) {
		conflicts.push({ kind: 'lastName', stella: person.lastName, card: card.lastName });
	}

	for (const kind of ['nickname', 'company', 'jobTitle'] as const) {
		const incoming = card[kind];
		const held = person[kind];
		if (!incoming) continue;
		if (!held) add.push({ kind, value: incoming });
		else if (foldText(held) !== foldText(incoming)) kept.push({ kind, value: incoming });
	}

	if (card.birthday && !person.birthday) add.push({ kind: 'birthday', date: card.birthday });
	else if (card.birthday && person.birthday && !birthdayHeld(person.birthday, card.birthday)) {
		conflicts.push({ kind: 'birthday', stella: person.birthday, card: card.birthday });
	}

	if (card.photo === 'inline' && !person.hasPhoto) add.push({ kind: 'photo' });

	const tags = new Set(person.tags.map(foldText));
	for (const name of card.tags) {
		if (tags.has(foldText(name))) continue;
		tags.add(foldText(name));
		add.push({ kind: 'tag', name });
	}

	return { add, conflicts, kept };
}
