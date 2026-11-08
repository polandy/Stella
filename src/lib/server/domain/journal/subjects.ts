import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import { allowedForAudience } from '../../../mentions/audience';
import type { Visibility } from '../../access/visibility';

/*
 * The people a journal entry is about, its subjects (docs/02 §2.20.3, ADR-131): the anchor
 * first, as `contact_id`, the rest beside it. The day slot is keyed by the set of them.
 */

/** An entry is about somebody; dropping the last person is removing it. */
export class NoJournalSubjectError extends TranslatableError {
	constructor() {
		super(phrase('errors.journal.noSubject'), 'NoJournalSubjectError');
	}
}

/** A subject the entry's audience may not see — a private person in a shared moment. */
export class JournalSubjectNotAllowedError extends TranslatableError {
	constructor() {
		super(phrase('errors.journal.subjectNotAllowed'), 'JournalSubjectNotAllowedError');
	}
}

/** The slot key of a set of people: their ids sorted and `,`-joined (docs/03 `subject_key`). */
export function subjectKeyOf(subjectIds: readonly string[]): string {
	return [...new Set(subjectIds)].sort().join(',');
}

/** The subjects once, in the order given, so the first stays the anchor. */
export function distinctSubjects(subjectIds: readonly string[]): string[] {
	return [...new Set(subjectIds)];
}

/**
 * The subjects an entry of this visibility may have, anchor first: each one already on it, or
 * one the author sees — for a shared entry one the household sees (the mention rule,
 * `allowedForAudience`). Throws rather than drop anyone, so an edit never loses a person in silence.
 */
export function subjectsForAudience(
	visible: readonly { id: string; visibility: Visibility }[],
	visibility: Visibility,
	subjectIds: readonly string[],
	already: readonly string[] = []
): string[] {
	const subjects = distinctSubjects(subjectIds);
	if (subjects.length === 0) throw new NoJournalSubjectError();
	const allowed = new Set([
		...already,
		...allowedForAudience(visible, visibility).map((c) => c.id)
	]);
	if (subjects.some((id) => !allowed.has(id))) throw new JournalSubjectNotAllowedError();
	return subjects;
}

/**
 * The posted subjects plus those already on the entry that the author does not see: the editor
 * could not show them as chips, so their absence from the form is no removal.
 */
export function withUnseenSubjects(
	posted: readonly string[],
	already: readonly string[],
	visible: readonly { id: string }[]
): string[] {
	const seen = new Set(visible.map((c) => c.id));
	return distinctSubjects([...posted, ...already.filter((id) => !seen.has(id))]);
}
