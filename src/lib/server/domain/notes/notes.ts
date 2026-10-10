import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Remover, Visibility, Viewer } from '../../access/visibility';
import type { ActivityOf } from '../activity/activity';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Note use-cases (docs/02 §2.5). Notes are child records of a contact; their visibility is
 * enforced through the central access scoping in the adapter. Orchestration is pure.
 */

/** An edit that would leave the note without text; removing it is the delete's job. */
export class EmptyNoteError extends TranslatableError {
	constructor() {
		super(phrase('errors.note.empty'), 'EmptyNoteError');
	}
}

export interface NoteCreator {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
}

export interface NewNote {
	id: string;
	contactId: string;
	createdBy: string;
	visibility: Visibility;
	title: string | null;
	body: string;
	isPinned: boolean;
	createdAt: number;
	updatedAt: number;
}

/** A note as read back for display (the body is Markdown source). */
export interface Note extends NewNote {}

/** What a removal needs to know of a note it may remove (docs/03 §3.7). */
export interface RemovableNote {
	id: string;
	contactId: string;
	/** The person's name and visibility, for the activity entry an admin's removal writes. */
	person: string;
	personVisibility: Visibility;
	authorId: string;
	authorName: string;
}

/** What an edit needs to know of a note its author may edit (docs/03 §3.7). */
export interface EditableNote {
	id: string;
	contactId: string;
	visibility: Visibility;
}

export interface NoteRepository {
	insert(note: NewNote): Promise<void>;
	/** Notes on a contact the viewer may see, pinned first then newest. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Note[]>;
	/** Rebuild a note's @-mention links to exactly these contacts (docs/02 §2.20.1). */
	replaceMentions(noteId: string, contactIds: string[]): Promise<void>;
	/** The people a note references, for the reverse lookup. */
	listMentionedContactIds(noteId: string): Promise<string[]>;
	/** The author's note, while they may edit it (`authoredEditableBy`); else null. */
	findOwn(author: Viewer, id: string): Promise<EditableNote | null>;
	/**
	 * Rewrite the title and body of a note the author may edit — checked again here, at the
	 * moment of the write. Whether it did.
	 */
	updateOwn(
		author: Viewer,
		p: { id: string; title: string | null; body: string; updatedAt: number }
	): Promise<boolean>;
	/** The note, when the remover may remove it (`authoredRemovableBy`); else null. */
	findRemovableBy(remover: Remover, id: string): Promise<RemovableNote | null>;
	/**
	 * Delete the note when the remover may — checked again here, at the moment of removal —
	 * with its mentions, and write `audit` in the same transaction if one went. Whether it did.
	 */
	deleteRemovableBy(
		remover: Remover,
		id: string,
		audit: ActivityOf<'record.removed'> | null
	): Promise<boolean>;
}

export interface NoteDeps {
	notes: NoteRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface CreateNoteInput {
	contactId: string;
	title?: string | null;
	body: string;
	visibility?: Visibility;
	isPinned?: boolean;
}

export const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Create a note on a contact. The caller must have verified the contact is visible. */
export async function createNote(
	deps: NoteDeps,
	creator: NoteCreator,
	input: CreateNoteInput
): Promise<string> {
	const body = input.body.trim();
	if (body.length === 0) {
		throw new Error('A note needs some content.');
	}

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.notes.insert({
		id,
		contactId: input.contactId,
		createdBy: creator.userId,
		visibility: input.visibility ?? creator.defaultVisibility,
		title: orNull(input.title),
		body,
		isPinned: input.isPinned ?? false,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/** List the notes on a contact that the viewer may see. */
export async function listNotesForContact(
	deps: Pick<NoteDeps, 'notes'>,
	viewer: Viewer,
	contactId: string
): Promise<Note[]> {
	return deps.notes.listForContactVisibleTo(viewer, contactId);
}

/**
 * Point a note's @-mention links at exactly the people its body names (docs/02 §2.20.1). Called
 * after the note is written, with the ids the shared resolver found; duplicates in the body
 * collapse to one link.
 */
export async function setNoteMentions(
	deps: Pick<NoteDeps, 'notes'>,
	noteId: string,
	contactIds: string[]
): Promise<void> {
	await deps.notes.replaceMentions(noteId, [...new Set(contactIds)]);
}
