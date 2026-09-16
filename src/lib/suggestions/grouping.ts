import type { Relation } from './types';

/*
 * Who a claim is about (docs/concepts/relationship-suggestions.md §6.6).
 *
 * A household-wide pass answers about everyone at once, and an undifferentiated list of forty
 * sentences is not help. Grouped by the person each claim is about, it reads as a page per
 * family instead — and which person that is follows from the claim, not from the screen, so it
 * is decided here rather than in a component.
 */

/** The ends of a claim, with the names the interface needs to phrase it. */
export interface NamedClaim {
	relation: Relation;
	fromId: string;
	toId: string;
	fromName: string;
	toName: string;
}

/** Every claim about one person, in the order the engine returned them. */
export interface SubjectGroup<T extends NamedClaim> {
	subjectId: string;
	subjectName: string;
	suggestions: T[];
}

/**
 * The person a claim is about. A parent claim answers a question about the **child** — "who
 * are Lisa's parents" — so it belongs on Lisa's row rather than on the parent's, where it
 * would be one of many children and read as a list of someone else's family. A sibling claim
 * names its two ends symmetrically, and is filed under the one the rule named first.
 */
const subjectOf = (claim: NamedClaim): [string, string] =>
	claim.relation === 'parent' ? [claim.toId, claim.toName] : [claim.fromId, claim.fromName];

/** Groups claims by the person they are about, keeping the engine's order within and between. */
export function groupBySubject<T extends NamedClaim>(claims: readonly T[]): SubjectGroup<T>[] {
	const groups = new Map<string, SubjectGroup<T>>();
	for (const claim of claims) {
		const [subjectId, subjectName] = subjectOf(claim);
		const group = groups.get(subjectId);
		if (group) group.suggestions.push(claim);
		else groups.set(subjectId, { subjectId, subjectName, suggestions: [claim] });
	}
	return [...groups.values()];
}
