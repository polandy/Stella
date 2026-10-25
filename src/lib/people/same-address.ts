/*
 * When two address lines are one address (docs/02 §2.2, *A shared home*): equal after folding
 * case, spaces and punctuation, and nothing looser — an accent or an abbreviation is a
 * different line, because a near-match merged by mistake moves someone without being asked.
 */

/** The words of an address, lower-cased, in order, one space between them. */
export function foldAddress(line: string): string {
	return line
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** Whether two lines name the same address; two blank lines name none. */
export function isSameAddress(a: string, b: string): boolean {
	const folded = foldAddress(a);
	return folded.length > 0 && folded === foldAddress(b);
}
