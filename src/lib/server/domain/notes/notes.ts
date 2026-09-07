import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Note use-cases (docs/02 §2.5). Notes are child records of a contact; their visibility is
 * enforced through the central access scoping in the adapter. Orchestration is pure.
 */

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

export interface NoteRepository {
	insert(note: NewNote): Promise<void>;
	/** Notes on a contact the viewer may see, pinned first then newest. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Note[]>;
	/** Rebuild a note's @-mention links to exactly these contacts (docs/02 §2.20.1). */
	replaceMentions(noteId: string, contactIds: string[]): Promise<void>;
	/** The people a note references, for the reverse lookup. */
	listMentionedContactIds(noteId: string): Promise<string[]>;
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

const orNull = (value?: string | null): string | null => {
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
