/*
 * A person's job title and company (docs/02 §2.2): two free-text fields, shown together as one
 * short form, and searched like a name (docs/02 §2.9). Pure and client-safe — the profile, the
 * People list, ⌘K, the pickers and the search page all ask these functions, so the wording and
 * the "found by the job" rule cannot drift between them.
 */

/** The most characters either field holds; the domain refuses more, the inputs stop there. */
export const JOB_FIELD_MAX_LENGTH = 200;

/** The two parts, trimmed; at least one is set wherever a `Job` is passed around. */
export interface Job {
	jobTitle: string | null;
	company: string | null;
}

/** The two parts as a record carries them — either may be missing or blank. */
interface JobFields {
	jobTitle?: string | null;
	company?: string | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

/** Lower-case with accents stripped, the folding every other name match uses. */
const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The job as shown, or null when neither part is on record. */
export function jobOf(person: JobFields): Job | null {
	const jobTitle = trimmedOrNull(person.jobTitle);
	const company = trimmedOrNull(person.company);
	return jobTitle === null && company === null ? null : { jobTitle, company };
}

/**
 * "Teacher at Primarschule Muri", or the one part alone when the other is missing; null when
 * nothing is on record. `at` words the pair in the reader's language, so this stays language-free.
 */
export function jobShortForm(
	person: JobFields,
	at: (parts: { job: string; company: string }) => string
): string | null {
	const job = jobOf(person);
	if (job === null) return null;
	if (job.jobTitle !== null && job.company !== null)
		return at({ job: job.jobTitle, company: job.company });
	return job.jobTitle ?? job.company;
}

/** What a person is otherwise found by: every name they go by, and their description. */
interface Searchable extends JobFields {
	displayName: string;
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
	formerName?: string | null;
	description?: string | null;
}

/**
 * Whether some word of the query is found in the job title or company and in none of the names
 * or the description — then a search row says *Job*, because a hit that nothing on the row
 * explains is a puzzle (the same rule as `foundByFormerName`).
 */
export function foundByJob(person: Searchable, query: string): boolean {
	const job = jobOf(person);
	if (job === null) return false;
	const words = fold(query).split(/\s+/).filter(Boolean);
	const jobText = fold([job.jobTitle, job.company].filter(Boolean).join(' '));
	const otherText = fold(
		[
			person.displayName,
			person.firstName,
			person.lastName,
			person.nickname,
			person.formerName,
			person.description
		]
			.filter((part): part is string => typeof part === 'string')
			.join(' ')
	);
	return words.some((word) => jobText.includes(word) && !otherText.includes(word));
}

/** Where a job is edited: under the name in the header, or the profile card's *Job* row. */
export const JOB_EDITOR_PLACES = ['header', 'profile'] as const;
export type JobEditorPlace = (typeof JOB_EDITOR_PLACES)[number];

/**
 * The error of the last job save for the editor at `place`, or null. Both editors post to the
 * same action, so the result names the one that posted, and only that one reopens with it.
 */
export function jobErrorFor(
	place: JobEditorPlace,
	/** The page's last form result, whichever action produced it. */
	result: Record<string, unknown> | null | undefined
): string | null {
	if (result?.jobErrorAt !== place) return null;
	return typeof result.jobError === 'string' ? result.jobError : null;
}
