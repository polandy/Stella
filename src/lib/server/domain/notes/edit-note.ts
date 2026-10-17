import { mentionsOtherThan } from '../../../mentions/mentions';
import type { Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { ContactDirectoryReads } from '../contacts/directory';
import { resolveForAudience } from '../mentions/resolve-for-audience';
import { EmptyNoteError, orNull, setNoteMentions, type NoteRepository } from './notes';

/*
 * Editing a note (docs/02 §2.5, docs/03 §3.7), whole: its author alone, title, body and whether
 * it is shared or private. The mentions are resolved against the audience the note has after the
 * edit — as when it was written — so an edit never widens access. Edits are not in the activity feed (docs/02 §2.11); the search
 * row follows the UPDATE and the rewritten mentions by triggers.
 */

export interface EditNoteDeps {
	notes: Pick<NoteRepository, 'findOwn' | 'updateOwn' | 'replaceMentions'>;
	clock: Clock;
	/** Whom an @-mention can name: the people the author sees. */
	directory: Pick<ContactDirectoryReads, 'listVisibleTo'>;
}

export interface EditNoteInput {
	id: string;
	title?: string | null;
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	/** Shared or private from now on; left as it is when absent. */
	visibility?: Visibility;
}

/**
 * Rewrite a note's title, body and visibility; whether it did. A note that is gone and one its author may no
 * longer edit answer alike, so a foreign id reveals nothing.
 */
export async function editNote(
	deps: EditNoteDeps,
	author: { userId: string; householdId: string },
	input: EditNoteInput
): Promise<boolean> {
	const body = input.body.trim();
	if (body.length === 0) throw new EmptyNoteError();

	const viewer = { id: author.userId, householdId: author.householdId };
	const found = await deps.notes.findOwn(viewer, input.id);
	if (!found) return false;

	const visibility = input.visibility ?? found.visibility;
	const resolved = resolveForAudience(await deps.directory.listVisibleTo(viewer), visibility, body);
	const written = await deps.notes.updateOwn(viewer, {
		id: input.id,
		title: orNull(input.title),
		body: resolved.body,
		visibility,
		updatedAt: deps.clock.now()
	});
	if (!written) return false;

	await setNoteMentions(deps, input.id, mentionsOtherThan(resolved.ids, found.contactId));
	return true;
}
