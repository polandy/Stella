import type { BirthDatePrecision } from './contacts';

/*
 * Combining the two profiles when a household merges duplicates (docs/02 §2.2). Pure: it
 * decides only what the merged person should say, never what happens to their notes, links
 * or photos — that is the repository's job, because the collisions live in the constraints.
 *
 * The shape is the set of profile columns that can be empty; `display_name` and `visibility`
 * are deliberately absent, because the surviving record's own answer is the one the household
 * chose when they picked which of the two to keep.
 */

/** The nullable profile columns of a contact (docs/03 §contact). */
export interface MergeableProfile {
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	prefix: string | null;
	suffix: string | null;
	formerName: string | null;
	gender: string | null;
	pronouns: string | null;
	description: string | null;
	avatarPhotoId: string | null;
	birthDate: string | null;
	birthDatePrecision: BirthDatePrecision;
	isDeceased: boolean;
	deathDate: string | null;
	jobTitle: string | null;
	company: string | null;
	howWeMet: string | null;
	metDate: string | null;
	metPlace: string | null;
}

/** Columns where "the one that says something" wins, and the survivor says it first. */
const FILL_IF_EMPTY = [
	'firstName',
	'lastName',
	'nickname',
	'prefix',
	'suffix',
	'formerName',
	'gender',
	'pronouns',
	'description',
	'avatarPhotoId',
	'jobTitle',
	'company',
	'howWeMet',
	'metDate',
	'metPlace'
] as const satisfies readonly (keyof MergeableProfile)[];

/**
 * The profile the surviving contact should carry. Everything the survivor already says is
 * kept; every blank is filled from the record being merged away, so a duplicate that only
 * ever got a phone number and a job title gives both up rather than taking them with it.
 *
 * Two fields do not follow that rule on their own:
 *
 * - **the birth date and its precision travel together** — filling one from each record would
 *   claim a day that nobody entered (docs/03 §3.4);
 * - **deceased is an OR, and the death date rides with it** — if either record says the person
 *   has died, the merged one does, and it keeps the day that was recorded with it.
 */
export function mergeProfiles(keep: MergeableProfile, mergedAway: MergeableProfile): MergeableProfile {
	const merged = { ...keep };
	for (const field of FILL_IF_EMPTY) {
		merged[field] ??= mergedAway[field];
	}

	if (keep.birthDate === null && mergedAway.birthDate !== null) {
		merged.birthDate = mergedAway.birthDate;
		merged.birthDatePrecision = mergedAway.birthDatePrecision;
	}

	if (mergedAway.isDeceased && !keep.isDeceased) {
		merged.isDeceased = true;
		merged.deathDate = mergedAway.deathDate;
	} else {
		merged.deathDate ??= mergedAway.deathDate;
	}

	return merged;
}
