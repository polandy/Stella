/*
 * Two rows that turn out to be one link (docs/03 §relationship): the merge meets them when both
 * records had the same tie, the restore when an archive holds one tie from both ends. One row
 * stays — its status included — and the other gives only what the kept one left blank, the
 * rule the profile follows.
 */

/** What a link says beyond its two ends and type, as far as a fold can fill it. */
export interface FoldableLinkDetails {
	description: string | null;
	sinceDate: string | null;
}

const blank = (value: string | null): boolean => value === null || value === '';

/** What `kept` takes from `copy`: just the fields to write, only where `kept` is blank. */
export function foldedLinkDetails(
	kept: FoldableLinkDetails,
	copy: FoldableLinkDetails
): Partial<FoldableLinkDetails> {
	const filled: Partial<FoldableLinkDetails> = {};
	if (blank(kept.description) && !blank(copy.description)) filled.description = copy.description;
	if (blank(kept.sinceDate) && !blank(copy.sinceDate)) filled.sinceDate = copy.sinceDate;
	return filled;
}
