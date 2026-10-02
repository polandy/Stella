/*
 * Was a person found by their former name rather than by the name they are shown by
 * (docs/02 §2.9)? Then a result says *Franziska Abab (formerly Widmer)*: finding someone under a
 * name they no longer carry is otherwise a puzzle. Pure and client-safe — the People list,
 * ⌘K, the pickers and the search page all ask this one function.
 */

/** Lower-case with accents stripped, the folding every other name match uses. */
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The former name, when some word of the query is found in it and not in the shown name; null
 * when the shown name explains the match, or there is no former name or no query.
 */
export function foundByFormerName(
	person: { displayName: string; formerName?: string | null },
	query: string
): string | null {
	const former = person.formerName?.trim();
	if (!former) return null;
	const words = fold(query).split(/\s+/).filter(Boolean);
	const shown = fold(person.displayName);
	const formerFolded = fold(former);
	return words.some((word) => formerFolded.includes(word) && !shown.includes(word)) ? former : null;
}
