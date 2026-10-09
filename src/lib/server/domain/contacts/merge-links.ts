import {
	relationshipPair,
	type Endpoints,
	type RelationshipPair
} from '../../../relationships/endpoints';

/*
 * Where a link of the record being merged away lands (docs/02 §2.2). Repointing one column
 * at a time would leave a symmetric link unsorted whenever the third person's id sorts between
 * the two records', and the unique index and the duplicate check would then miss it from the
 * other end (docs/03 §relationship). So the new ends come from `relationshipPair`, like every
 * other writer's; `db/contact-merge.ts` runs this in the merge's transaction.
 */

/**
 * The stored ends of `link` once its merged end is the survivor, or null for a link between
 * the two, which would point at one person (that one goes).
 */
export function linkAfterMerge(
	link: Endpoints,
	{ keepId, mergedId }: { keepId: string; mergedId: string },
	symmetric: boolean
): RelationshipPair | null {
	const { fromContactId: from, toContactId: to } = link;
	if (from !== mergedId && to !== mergedId) {
		throw new Error('A merge only moves the links of the record merged away.');
	}
	const moved = (id: string) => (id === mergedId ? keepId : id);
	if (moved(from) === moved(to)) return null;
	return relationshipPair(moved(from), moved(to), symmetric);
}

/** What a link says beyond its two ends and type, as far as a fold can fill it. */
export interface FoldableLinkDetails {
	description: string | null;
	sinceDate: string | null;
}

const blank = (value: string | null): boolean => value === null || value === '';

/**
 * Where both records had the same link, the survivor's row stays — its status included — and
 * only what it left blank is filled from the merged copy, the rule the profile follows.
 * Returns just the fields to write.
 */
export function foldedLinkDetails(
	survivor: FoldableLinkDetails,
	merged: FoldableLinkDetails
): Partial<FoldableLinkDetails> {
	const filled: Partial<FoldableLinkDetails> = {};
	if (blank(survivor.description) && !blank(merged.description)) {
		filled.description = merged.description;
	}
	if (blank(survivor.sinceDate) && !blank(merged.sinceDate)) filled.sinceDate = merged.sinceDate;
	return filled;
}
