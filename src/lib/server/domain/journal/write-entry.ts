import { mentionsOtherThan } from '../../../mentions/mentions';
import type { Visibility } from '../../access/visibility';
import type { ContactRepository } from '../contacts/contacts';
import type { ContactDirectoryReads } from '../contacts/directory';
import { requireVisibleContact } from '../contacts/require-visible';
import { resolveForAudience } from '../mentions/resolve-for-audience';
import { addToJournalDay, type JournalDayDeps } from './journal';

/*
 * Adding to a person's journal (docs/02 §2.20). Whether it comes from the journal page or the
 * moment composer (§2.22.1), what is written is an *addition*: a day slot that already holds an
 * entry gets the new text appended rather than replaced. That is what lets an entry kept on a
 * phone (docs/02 §2.18.1) arrive days later without overwriting anything
 * written meanwhile. Changing what is already there is `editJournalEntry`'s job.
 */

export interface WriteJournalEntryDeps extends JournalDayDeps {
	contacts: Pick<ContactRepository, 'findByIdVisibleTo'>;
	/** Whom an @-mention can name: the people the author sees. */
	directory: Pick<ContactDirectoryReads, 'listVisibleTo'>;
}

export interface WriteJournalEntryInput {
	contactId: string;
	entryDate: string;
	title: string | null;
	/** Markdown with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	visibility: Visibility;
}

/**
 * Write on the journal page of a person the author can see. Mentions resolve against the
 * entry's audience only, so a mention never widens access, and the person the journal is about
 * is not their own mention.
 */
export async function writeJournalEntry(
	deps: WriteJournalEntryDeps,
	author: { userId: string; householdId: string },
	input: WriteJournalEntryInput
): Promise<{
	entryId: string;
	anchorContactId: string;
	visibility: Visibility;
}> {
	await requireVisibleContact(deps.contacts, author, input.contactId);
	const viewer = { id: author.userId, householdId: author.householdId };
	const resolved = resolveForAudience(
		await deps.directory.listVisibleTo(viewer),
		input.visibility,
		input.body
	);
	const entryId = await addToJournalDay(
		deps,
		{ ...author, defaultVisibility: input.visibility },
		{
			contactId: input.contactId,
			entryDate: input.entryDate,
			visibility: input.visibility,
			title: input.title,
			body: resolved.body,
			mentionIds: mentionsOtherThan(resolved.ids, input.contactId)
		}
	);
	return {
		entryId,
		anchorContactId: input.contactId,
		visibility: input.visibility
	};
}
