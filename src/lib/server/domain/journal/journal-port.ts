import type { Remover, Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { ActivityOf } from '../activity/activity';
import type { RemovableRecord } from '../activity/removal';
import type { DeletedPhotoFiles, MediaStore } from '../media/avatars';

/* The journal's shapes and its port (docs/02 §2.20, docs/08 §8.3); the use-cases are `journal.ts`. */

export interface JournalAuthor {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
}

export interface NewJournalEntry {
	id: string;
	/** The anchor: the first of `subjectIds`. */
	contactId: string;
	/** Everyone the entry is about, the anchor first (§2.20.3). */
	subjectIds: string[];
	createdBy: string;
	visibility: Visibility;
	/** The day the entry is *about*, as an ISO `YYYY-MM-DD` string (distinct from createdAt). */
	entryDate: string;
	title: string | null;
	/** Markdown source; rendered safely for display. */
	body: string;
	createdAt: number;
	updatedAt: number;
}

/** A journal entry as read back for display (the body is Markdown source). */
export interface JournalEntry extends NewJournalEntry {}

export interface JournalRepository {
	/** The author's entry for a specific day+visibility slot about these people, or null. */
	findDay(params: {
		authorId: string;
		subjectIds: readonly string[];
		entryDate: string;
		visibility: Visibility;
	}): Promise<JournalEntry | null>;
	insert(entry: NewJournalEntry): Promise<void>;
	updateBody(params: {
		id: string;
		title: string | null;
		body: string;
		updatedAt: number;
	}): Promise<void>;
	/**
	 * Edit the title/body of an entry the author owns; the day and visibility are part of an
	 * entry's identity (docs/02 §2.20) and stay put here. Returns whether such an entry existed.
	 */
	updateOwn(params: {
		authorId: string;
		id: string;
		title: string | null;
		body: string;
		updatedAt: number;
	}): Promise<boolean>;
	/**
	 * Give an entry the author owns exactly these subjects, the first its anchor; joined into the
	 * author's entry about the same people that day when there is one. Returns the id holding it
	 * afterwards, or null when the author owns no such entry.
	 */
	setSubjectsOwn(params: {
		authorId: string;
		id: string;
		subjectIds: readonly string[];
		updatedAt: number;
	}): Promise<string | null>;
	/** Entries about a contact (anchor or subject) the viewer may see, newest day first. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<JournalEntry[]>;
	/**
	 * One keyset page of visible entries, newest day first. `before` excludes everything at or
	 * after that (entryDate, createdAt) point, so passing the previous page's last entry walks
	 * backwards through time without gaps or repeats.
	 */
	listPageForContactVisibleTo(
		viewer: Viewer,
		contactId: string,
		opts: { limit: number; before?: JournalCursor }
	): Promise<JournalEntry[]>;
	/** The entry, when the remover may remove it (`authoredRemovableBy`); else null. */
	findRemovableBy(remover: Remover, id: string): Promise<RemovableRecord | null>;
	/**
	 * Delete the entry when the remover may — checked again here, at the moment of removal —
	 * with the photos it carries, and write `audit` in the same transaction if one went.
	 * Returns their files to unlink, or null when there was no such entry to remove.
	 */
	deleteRemovableBy(
		remover: Remover,
		id: string,
		audit: ActivityOf<'record.removed'> | null
	): Promise<DeletedPhotoFiles[] | null>;
	/** Replace an entry's @-mention links with exactly these contact ids (docs/02 §2.20.1). */
	replaceMentions(journalEntryId: string, contactIds: string[]): Promise<void>;
	/** Contact ids an entry mentions. */
	listMentionedContactIds(journalEntryId: string): Promise<string[]>;
	/**
	 * Give an entry exactly these tags (docs/02 §2.20.2): each found in the household's set by
	 * its key, or added to it in this spelling; a tag no entry carries any more is swept.
	 */
	replaceTags(journalEntryId: string, names: string[]): Promise<void>;
}

/** Opaque-ish cursor: the (entryDate, createdAt) of the last entry a client has seen. */
export interface JournalCursor {
	entryDate: string;
	createdAt: number;
}

export interface JournalPage {
	entries: JournalEntry[];
	/** Cursor to fetch the next (older) page, or null when the beginning is reached. */
	nextCursor: JournalCursor | null;
}

export interface JournalDeps {
	journal: JournalRepository;
	/** Deleting an entry takes the bytes of the photos inside it. */
	media: Pick<MediaStore, 'delete'>;
	ids: IdGenerator;
	clock: Clock;
}

/** What writing into a day slot needs — the narrow part of `JournalDeps`. */
export interface JournalDayDeps {
	journal: Pick<
		JournalRepository,
		| 'findDay'
		| 'insert'
		| 'updateBody'
		| 'replaceMentions'
		| 'listMentionedContactIds'
		| 'replaceTags'
	>;
	ids: IdGenerator;
	clock: Clock;
}
