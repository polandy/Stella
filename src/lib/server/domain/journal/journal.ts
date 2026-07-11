import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Journal use-cases (docs/02 §2.20). A journal is a per-person diary: household members record
 * a contact's moments day by day, in Markdown, optionally with photos (added separately). An
 * entry is a child record of a contact — its visibility follows the central rule (private ⇒
 * only the author). Uniqueness is per (contact, author, day, visibility): saving the same slot
 * again edits it rather than duplicating, which is what "one entry per day" means in practice
 * while still allowing a member a separate private and shared entry for the same day.
 * Orchestration is pure; visibility-scoped reads live in the adapter.
 */

export interface JournalAuthor {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
}

export interface NewJournalEntry {
	id: string;
	contactId: string;
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
	/** The author's entry for a specific day+visibility slot, or null. */
	findDay(params: {
		authorId: string;
		contactId: string;
		entryDate: string;
		visibility: Visibility;
	}): Promise<JournalEntry | null>;
	insert(entry: NewJournalEntry): Promise<void>;
	updateBody(params: { id: string; title: string | null; body: string; updatedAt: number }): Promise<void>;
	/** Entries on a contact the viewer may see, newest day first. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<JournalEntry[]>;
	/** Delete an entry the viewer authored; returns whether a row was removed. */
	deleteOwn(params: { authorId: string; id: string }): Promise<boolean>;
}

export interface JournalDeps {
	journal: JournalRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface SaveJournalEntryInput {
	contactId: string;
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
	deps: JournalDeps,
	author: JournalAuthor,
	input: SaveJournalEntryInput
): Promise<string> {
	const body = input.body.trim();
	if (body.length === 0) {
		throw new Error('A journal entry needs some content.');
	}
	if (!ISO_DATE.test(input.entryDate)) {
		throw new Error('A journal entry needs a valid date (YYYY-MM-DD).');
	}

	const visibility = input.visibility ?? author.defaultVisibility;
	const title = orNull(input.title);
	const now = deps.clock.now();

	const existing = await deps.journal.findDay({
		authorId: author.userId,
		contactId: input.contactId,
		entryDate: input.entryDate,
		visibility
	});
	if (existing) {
		await deps.journal.updateBody({ id: existing.id, title, body, updatedAt: now });
		return existing.id;
	}

	const id = deps.ids.next();
	await deps.journal.insert({
		id,
		contactId: input.contactId,
		createdBy: author.userId,
		visibility,
		entryDate: input.entryDate,
		title,
		body,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/** List the journal entries on a contact that the viewer may see (newest day first). */
export async function listJournalForContact(
	deps: Pick<JournalDeps, 'journal'>,
	viewer: Viewer,
	contactId: string
): Promise<JournalEntry[]> {
	return deps.journal.listForContactVisibleTo(viewer, contactId);
}

/** Delete one of the viewer's own journal entries. Returns whether a row was removed. */
export async function deleteJournalEntry(
	deps: Pick<JournalDeps, 'journal'>,
	author: JournalAuthor,
	id: string
): Promise<boolean> {
	return deps.journal.deleteOwn({ authorId: author.userId, id });
}
