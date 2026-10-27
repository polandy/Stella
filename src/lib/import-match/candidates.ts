import { fullName, type IncomingCard, type MatchablePerson } from './card';
import { foldName, normaliseEmail, normalisePhone, samePhone } from './normalise';

/*
 * Who a card may be (docs/02 §2.16.2). The people handed in are already
 * the ones the member may see and who are not archived; the access layer chose them, so a
 * private person of someone else is never a candidate, never named and never counted.
 */

/** Why a person was suggested, with the value as Stella holds it so the member recognises it. */
export type MatchReason =
	| { kind: 'email'; value: string }
	| { kind: 'phone'; value: string }
	/** The last nine digits agree, but one side names no country. */
	| { kind: 'phoneAlike'; value: string }
	| { kind: 'name' };

export type MatchStrength = 'strong' | 'weak';

export interface Candidate {
	personId: string;
	strength: MatchStrength;
	reasons: MatchReason[];
}

/** The review's four kinds of card. */
export type CardMatch =
	| { kind: 'strong' | 'weak'; candidate: Candidate }
	| { kind: 'several'; candidates: Candidate[] }
	| { kind: 'none' };

const isStrong = (reason: MatchReason) => reason.kind === 'email' || reason.kind === 'phone';

/** Every way the card reaches this person, each reason once, in the card's order. */
function reasonsFor(card: IncomingCard, person: MatchablePerson): MatchReason[] {
	const reasons: MatchReason[] = [];
	const add = (reason: MatchReason) => {
		if (!reasons.some((r) => JSON.stringify(r) === JSON.stringify(reason))) reasons.push(reason);
	};

	const emails = person.fields.filter((f) => f.kind === 'email');
	for (const { value } of card.emails) {
		const held = emails.find((f) => normaliseEmail(f.value) === normaliseEmail(value));
		if (held) add({ kind: 'email', value: held.value });
	}

	const phones = person.fields.filter((f) => f.kind === 'phone');
	for (const { value } of card.phones) {
		const incoming = normalisePhone(value);
		for (const held of phones) {
			const verdict = samePhone(incoming, normalisePhone(held.value));
			if (verdict === 'same') add({ kind: 'phone', value: held.value });
			else if (verdict === 'alike') add({ kind: 'phoneAlike', value: held.value });
		}
	}

	const name = foldName(fullName(card));
	if (name.length > 0 && name === foldName(fullName(person))) add({ kind: 'name' });
	return reasons;
}

/** Strong ones first, then the one with more in common, then by name. */
function byLikelihood(people: Map<string, MatchablePerson>) {
	return (a: Candidate, b: Candidate) =>
		(a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1) ||
		b.reasons.length - a.reasons.length ||
		people.get(a.personId)!.displayName.localeCompare(people.get(b.personId)!.displayName);
}

/**
 * Which of `people` the card may be. Strong only when a shared email or phone points at exactly
 * one person; as soon as more than one person is reached by any rule, the member picks.
 */
export function matchCard(card: IncomingCard, people: MatchablePerson[]): CardMatch {
	const candidates: Candidate[] = [];
	for (const person of people) {
		const reasons = reasonsFor(card, person);
		if (reasons.length === 0) continue;
		candidates.push({
			personId: person.id,
			strength: reasons.some(isStrong) ? 'strong' : 'weak',
			reasons
		});
	}

	if (candidates.length === 0) return { kind: 'none' };
	if (candidates.length === 1) return { kind: candidates[0]!.strength, candidate: candidates[0]! };
	const byId = new Map(people.map((p) => [p.id, p]));
	return { kind: 'several', candidates: candidates.sort(byLikelihood(byId)) };
}
