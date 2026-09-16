import type { Exclusion } from './exclusions';
import type { RelationshipTypeOption, SelectableType } from './type-options';

/*
 * How the picker shows what it cannot offer (docs/02 §2.4).
 *
 * The reason deliberately does **not** go into the entry's own label. An entry reads "X of",
 * and so does the link standing in the way, so writing both in one line — "Grandparent of —
 * already Godchild of Bert Weber" — puts two of those phrases side by side and a reader
 * takes the second as a statement about the first. Instead the entries keep their own words
 * and the run they belong to carries the reason once, above them.
 *
 * Pure: the caller says what is refused, this only decides where the lines fall.
 */

/** A run of picker entries sharing one answer: refused for this reason, or free to pick. */
export interface PickerGroup<T extends SelectableType> {
	/** Null for a run that can be picked. */
	exclusion: Exclusion | null;
	options: RelationshipTypeOption<T>[];
}

/** Whether two answers are the same one, down to the person and the link they name. */
function sameExclusion(a: Exclusion | null, b: Exclusion | null): boolean {
	if (a === null || b === null) return a === b;
	return (
		a.reason === b.reason &&
		a.personId === b.personId &&
		a.partnerId === b.partnerId &&
		a.tie?.typeKey === b.tie?.typeKey &&
		a.tie?.side === b.tie?.side &&
		a.tie?.label === b.tie?.label
	);
}

/**
 * The picker's entries cut into consecutive runs, each carrying the one answer that holds
 * for all of it. The order is the order the entries arrive in and every entry is kept, so
 * grouping never quietly drops or reorders what can be picked.
 */
export function groupByExclusion<T extends SelectableType>(
	options: readonly RelationshipTypeOption<T>[],
	exclusionOf: (option: RelationshipTypeOption<T>) => Exclusion | null
): PickerGroup<T>[] {
	const groups: PickerGroup<T>[] = [];
	for (const option of options) {
		const exclusion = exclusionOf(option);
		const last = groups.at(-1);
		if (last && sameExclusion(last.exclusion, exclusion)) {
			last.options.push(option);
		} else {
			groups.push({ exclusion, options: [option] });
		}
	}
	return groups;
}

/**
 * The entry an untouched select stands on: the first that can be picked, not the first that
 * exists. A control skips its disabled entries when it chooses its own initial value, so
 * anything reading "what would be posted right now" has to skip them too. Null when every
 * entry is refused.
 */
export function firstPickable<T extends SelectableType>(
	options: readonly RelationshipTypeOption<T>[],
	exclusionOf: (option: RelationshipTypeOption<T>) => Exclusion | null
): RelationshipTypeOption<T> | null {
	return options.find((option) => exclusionOf(option) === null) ?? null;
}
