/*
 * Telling namesakes apart (docs/02 §2.2.3). A household ends up with several people called
 * just "Thomas" — met once, first name only — and a list of five identical names is no help
 * choosing one. Every person whose name another person on the list shares gets a second line
 * saying which one they are. Pure and client-safe: the pickers work it out as they render.
 */

/** What a person needs to carry for their namesakes to be told apart. */
export interface Distinguishable {
	id: string;
	displayName: string;
	description?: string | null;
	metPlace?: string | null;
	metDate?: string | null;
}

/** The second line under a namesake, wording left to the component (docs/02 §2.19). */
export type Distinction =
	| { kind: 'description'; text: string }
	/** At least one of the two is present. */
	| { kind: 'met'; place: string | null; year: string | null }
	| { kind: 'nothing' };

/** Names that look the same on screen count as the same; accents do not, they show. */
const sameNameKey = (displayName: string) => displayName.trim().toLowerCase();

const filled = (value: string | null | undefined) => value?.trim() || null;

/** The year a stored meeting date starts with, when it starts with one. */
const yearOf = (metDate: string | null | undefined) => /^\d{4}/.exec(metDate?.trim() ?? '')?.[0] ?? null;

function distinctionOf(person: Distinguishable): Distinction {
	const description = filled(person.description);
	if (description) return { kind: 'description', text: description };
	const place = filled(person.metPlace);
	const year = yearOf(person.metDate);
	if (place || year) return { kind: 'met', place, year };
	return { kind: 'nothing' };
}

/**
 * The second line for every person on `people` who shares their name with another one on it,
 * by id. Pass the whole list a picker offers, not just what the query left: the name is just
 * as ambiguous when the other Thomas is filtered out of sight.
 */
export function tellApart(people: readonly Distinguishable[]): Map<string, Distinction> {
	const counts = new Map<string, number>();
	for (const p of people) {
		const key = sameNameKey(p.displayName);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const lines = new Map<string, Distinction>();
	for (const p of people) {
		if ((counts.get(sameNameKey(p.displayName)) ?? 0) > 1) lines.set(p.id, distinctionOf(p));
	}
	return lines;
}
