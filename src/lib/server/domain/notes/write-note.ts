import { mentionsOtherThan } from '../../../mentions/mentions';
import type { Visibility } from '../../access/visibility';
import type { ContactRepository } from '../contacts/contacts';
import { requireVisibleContact } from '../contacts/require-visible';
import { resolveForAudience } from '../mentions/resolve-for-audience';
import { createNote, setNoteMentions, type NoteDeps } from './notes';

/*
 * Writing a note on a person (docs/02 §2.5, §2.20.1), whole: the person must be one the author
 * can see, @-mentions resolve against the note's audience only — so a mention never widens
 * access — and a note naming its own subject does not list them as a mention. One use-case,
 * so the person page and a note kept on a phone (`note.add`, docs/concepts/offline-capture.md
 * §4.1) cannot drift apart.
 */

export interface WriteNoteDeps extends NoteDeps {
	contacts: Pick<ContactRepository, 'findByIdVisibleTo' | 'listVisibleTo'>;
}

export interface WriteNoteInput {
	contactId: string;
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	visibility: Visibility;
	isPinned: boolean;
}

/** Write a note on a person the author can see; returns its id. */
export async function writeNote(
	deps: WriteNoteDeps,
	author: { userId: string; householdId: string },
	input: WriteNoteInput
): Promise<{ noteId: string }> {
	await requireVisibleContact(deps.contacts, author, input.contactId);
	const viewer = { id: author.userId, householdId: author.householdId };

	const resolved = resolveForAudience(
		await deps.contacts.listVisibleTo(viewer),
		input.visibility,
		input.body
	);
	const noteId = await createNote(
		deps,
		{ ...author, defaultVisibility: input.visibility },
		{
			contactId: input.contactId,
			body: resolved.body,
			visibility: input.visibility,
			isPinned: input.isPinned
		}
	);
	await setNoteMentions(deps, noteId, mentionsOtherThan(resolved.ids, input.contactId));
	return { noteId };
}
