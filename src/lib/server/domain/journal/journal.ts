import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import { hashtagsIn } from '../../../hashtags/hashtags';
import type { Remover, Visibility, Viewer } from '../../access/visibility';
import { removalAudit } from '../activity/removal';
import { mentionsOtherThan } from '../../../mentions/mentions';
import { distinctSubjects, NoJournalSubjectError } from './subjects';
import type {
	JournalAuthor,
	JournalCursor,
	JournalDayDeps,
	JournalDeps,
	JournalEntry,
	JournalPage,
	JournalRepository
} from './journal-port';

export type {
	JournalAuthor,
	JournalCursor,
	JournalDayDeps,
	JournalDeps,
	JournalEntry,
	JournalPage,
	JournalRepository,
	NewJournalEntry
} from './journal-port';

/*
 * Journal use-cases (docs/02 §2.20). A journal is a per-person diary: household members record
 * a contact's moments day by day, in Markdown, optionally with photos (added separately). An
 * entry is a child record of a contact — its visibility follows the central rule (private ⇒
 * only the author). Uniqueness is per (people, author, day, visibility) — the people being its
 * subjects, the anchor first (§2.20.3): saving the same slot again edits it rather than
 * duplicating, while still allowing a member a separate private and shared entry for the day.
 * Orchestration is pure; visibility-scoped reads live in the adapter.
 */

/** An edit that would leave the entry without text; removing it is the delete's job. */
export class EmptyJournalEntryError extends TranslatableError {
	constructor() {
		super(phrase('errors.note.empty'), 'EmptyJournalEntryError');
	}
}

/** An entry belongs to one calendar day, written as `YYYY-MM-DD`. */
export class InvalidJournalDayError extends TranslatableError {
	constructor() {
		super(phrase('errors.journal.badDay'), 'InvalidJournalDayError');
	}
}

export interface SaveJournalEntryInput {
	contactId: string;
	/** Further people it is about, beside `contactId` (§2.20.3). */
	furtherSubjectIds?: string[];
	entryDate: string;
	body: string;
	title?: string | null;
	visibility?: Visibility;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * Create or update the author's journal entry for a contact on a given day. If an entry
 * already exists for the same (contact, author, day, visibility) slot it is edited in place;
 * otherwise a new one is created. Returns the entry id. The caller must have verified the
 * contact is visible to the author.
 */
export async function saveJournalEntry(
	deps: JournalDayDeps,
	author: JournalAuthor,
	input: SaveJournalEntryInput
): Promise<string> {
	const body = input.body.trim();
	if (body.length === 0) throw new EmptyJournalEntryError();
	if (!ISO_DATE.test(input.entryDate)) throw new InvalidJournalDayError();

	const visibility = input.visibility ?? author.defaultVisibility;
	const title = orNull(input.title);
	const now = deps.clock.now();

	const subjectIds = distinctSubjects([input.contactId, ...(input.furtherSubjectIds ?? [])]);
	const existing = await deps.journal.findDay({
		authorId: author.userId,
		subjectIds,
		entryDate: input.entryDate,
		visibility
	});
	if (existing) {
		await deps.journal.updateBody({ id: existing.id, title, body, updatedAt: now });
		await deps.journal.replaceTags(existing.id, hashtagsIn(body));
		return existing.id;
	}

	const id = deps.ids.next();
	await deps.journal.insert({
		id,
		contactId: input.contactId,
		subjectIds,
		createdBy: author.userId,
		visibility,
		entryDate: input.entryDate,
		title,
		body,
		createdAt: now,
		updatedAt: now
	});
	await deps.journal.replaceTags(id, hashtagsIn(body));
	return id;
}

export interface EditJournalEntryInput {
	id: string;
	body: string;
	title?: string | null;
	/** The people it names, resolved for its audience. */
	mentionIds: string[];
	/** Everyone it is about, the anchor first, already checked for its audience (§2.20.3). */
	subjectIds: string[];
}

/**
 * Edit the text and people of one of the author's own journal entries in place. The day and
 * visibility are part of an entry's identity (docs/02 §2.20) — changing either means writing a
 * new entry instead. People made equal to another of the author's entries that day join it
 * (§2.20.3). Returns the id holding the entry afterwards, or null when no such owned entry
 * existed.
 */
export async function editJournalEntry(
	deps: Pick<JournalDeps, 'clock'> & {
		journal: Pick<
			JournalRepository,
			'updateOwn' | 'replaceTags' | 'replaceMentions' | 'setSubjectsOwn'
		>;
	},
	author: Pick<JournalAuthor, 'userId'>,
	input: EditJournalEntryInput
): Promise<string | null> {
	const body = input.body.trim();
	if (body.length === 0) throw new EmptyJournalEntryError();
	const subjectIds = distinctSubjects(input.subjectIds);
	if (subjectIds.length === 0) throw new NoJournalSubjectError();
	const updatedAt = deps.clock.now();
	const own = await deps.journal.updateOwn({
		authorId: author.userId,
		id: input.id,
		title: orNull(input.title),
		body,
		updatedAt
	});
	if (!own) return null;
	await deps.journal.replaceTags(input.id, hashtagsIn(body));
	await setJournalMentions(deps, input.id, mentionsOtherThan(input.mentionIds, subjectIds));
	return deps.journal.setSubjectsOwn({
		authorId: author.userId,
		id: input.id,
		subjectIds,
		updatedAt
	});
}

/** List the journal entries on a contact that the viewer may see (newest day first). */
export async function listJournalForContact(
	deps: Pick<JournalDeps, 'journal'>,
	viewer: Viewer,
	contactId: string
): Promise<JournalEntry[]> {
	return deps.journal.listForContactVisibleTo(viewer, contactId);
}

/**
 * One page of a contact's journal for the viewer, newest first, for infinite scroll. Fetches
 * one extra row to decide whether an older page exists and to hand back the next cursor. The
 * caller must have verified the contact is visible.
 */
export async function listJournalPage(
	deps: Pick<JournalDeps, 'journal'>,
	viewer: Viewer,
	contactId: string,
	opts: { limit: number; before?: JournalCursor }
): Promise<JournalPage> {
	const limit = Math.max(1, Math.min(Math.trunc(opts.limit), 100));
	const rows = await deps.journal.listPageForContactVisibleTo(viewer, contactId, {
		limit: limit + 1,
		before: opts.before
	});
	const hasMore = rows.length > limit;
	const entries = hasMore ? rows.slice(0, limit) : rows;
	const last = entries.at(-1);
	return {
		entries,
		nextCursor: hasMore && last ? { entryDate: last.entryDate, createdAt: last.createdAt } : null
	};
}

/**
 * Persist the people an entry references (docs/02 §2.20.1). The caller resolves the body to
 * contact ids with the shared mention module, scoping candidates to the entry's audience, and
 * drops any self-reference before calling this. Rebuilds the entry's mention links wholesale.
 */
export async function setJournalMentions(
	deps: { journal: Pick<JournalRepository, 'replaceMentions'> },
	journalEntryId: string,
	contactIds: string[]
): Promise<void> {
	await deps.journal.replaceMentions(journalEntryId, [...new Set(contactIds)]);
}

/**
 * Remove a journal entry — its author's always, an admin's when it is shared (docs/03 §3.7) —
 * and the bytes of the photos inside it. The rows go first: a file left behind is the harmless
 * direction of that failure. A removal by someone other than the author is told to the
 * household in the delete's own transaction.
 */
export async function removeJournalEntry(
	deps: Pick<JournalDeps, 'journal' | 'media' | 'ids' | 'clock'>,
	remover: Remover,
	id: string
): Promise<boolean> {
	const found = await deps.journal.findRemovableBy(remover, id);
	if (!found) return false;
	const audit = removalAudit(deps, remover, 'journal_entry', found);
	const files = await deps.journal.deleteRemovableBy(remover, id, audit);
	if (files === null) return false;
	for (const file of files) {
		await deps.media.delete(file.filePath);
		await deps.media.delete(file.thumbPath);
	}
	return true;
}

/** Text for one day slot, its mentions already resolved to the people it names. */
export interface JournalDayAddition {
	contactId: string;
	/** Further people it is about, beside `contactId` (§2.20.3). */
	furtherSubjectIds?: string[];
	entryDate: string;
	visibility: Visibility;
	title: string | null;
	/** Markdown with canonical mention tokens. */
	body: string;
	/** Who else it names; merged with the slot's existing mentions. */
	mentionIds: string[];
}

/**
 * What the journal page and a moment both write (§2.20, §2.22.1): `addition` becomes a new
 * entry in its day slot, or is appended to the one already there. An existing title is kept;
 * an untitled day takes the new one. Returns the entry's id.
 */
export async function addToJournalDay(
	deps: JournalDayDeps,
	author: JournalAuthor,
	addition: JournalDayAddition
): Promise<string> {
	const body = addition.body.trim();
	if (body.length === 0) throw new EmptyJournalEntryError();
	const subjectIds = distinctSubjects([addition.contactId, ...(addition.furtherSubjectIds ?? [])]);
	const mentionIds = mentionsOtherThan(addition.mentionIds, subjectIds);
	const sameDay = await deps.journal.findDay({
		authorId: author.userId,
		subjectIds,
		entryDate: addition.entryDate,
		visibility: addition.visibility
	});
	if (!sameDay) {
		const entryId = await saveJournalEntry(deps, author, addition);
		await setJournalMentions(deps, entryId, mentionIds);
		return entryId;
	}
	const day = `${sameDay.body}\n\n${body}`;
	await deps.journal.updateBody({
		id: sameDay.id,
		title: sameDay.title ?? addition.title,
		body: day,
		updatedAt: deps.clock.now()
	});
	await deps.journal.replaceTags(sameDay.id, hashtagsIn(day));
	await setJournalMentions(deps, sameDay.id, [
		...(await deps.journal.listMentionedContactIds(sameDay.id)),
		...mentionIds
	]);
	return sameDay.id;
}
