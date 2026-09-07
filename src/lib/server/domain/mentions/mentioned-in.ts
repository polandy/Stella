import type { Viewer, Visibility } from '../../access/visibility';

/*
 * The passive side of an @-mention (docs/02 §2.20.1): not the chip that points forward, but
 * the list on the person who was named — every note and journal entry elsewhere that refers
 * to them, newest first.
 *
 * Notes and journal entries are stored and read separately, so the merge is a pure function
 * over the two lists and the use-case is only the part that fetches them — the same cut the
 * story timeline uses (docs/08 §8.3). Whether a viewer may see a reference at all is decided
 * in the adapter, through the central scoping in `access/`.
 */

/** Which kind of writing named the person. */
export type MentionSourceKind = 'note' | 'journal';

/** One passive reference, as the referenced person's page reads it. */
export interface MentionedIn {
	kind: MentionSourceKind;
	/** The note or journal entry doing the naming; it is owned and edited on its own person. */
	entryId: string;
	/** The person whose note or journal it is. */
	sourceContactId: string;
	sourceName: string;
	authorId: string;
	visibility: Visibility;
	/** The day the entry is about, ISO `YYYY-MM-DD`. */
	day: string;
	recordedAt: number;
	title: string | null;
	/** Markdown source, mention tokens included — the edge turns it into a preview. */
	body: string;
}

export interface MentionedInRepository {
	/** Notes naming this contact that the viewer may see, in no particular order. */
	listNoteMentionsOfVisibleTo(viewer: Viewer, contactId: string): Promise<MentionedIn[]>;
	/** Journal entries naming this contact that the viewer may see, in no particular order. */
	listJournalMentionsOfVisibleTo(viewer: Viewer, contactId: string): Promise<MentionedIn[]>;
}

export interface MentionedInDeps {
	mentions: MentionedInRepository;
}

/** Newest first: later day wins, then later recording, then a fixed order for a dead heat. */
function newestFirst(a: MentionedIn, b: MentionedIn): number {
	if (a.day !== b.day) return a.day < b.day ? 1 : -1;
	if (a.recordedAt !== b.recordedAt) return b.recordedAt - a.recordedAt;
	return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
}

/**
 * The references to one person as a single list. An entry that is already *about* them is
 * dropped: being named in your own journal says nothing new, and the spec calls that no
 * passive item at all. The rule lives here rather than in each query so both sources obey it.
 */
export function collectMentions(
	sources: readonly (readonly MentionedIn[])[],
	subjectContactId: string
): MentionedIn[] {
	return sources
		.flat()
		.filter((reference) => reference.sourceContactId !== subjectContactId)
		.sort(newestFirst);
}

/** Everything that names this contact and that the viewer may see, newest first. */
export async function listMentionedIn(
	deps: MentionedInDeps,
	viewer: Viewer,
	contactId: string
): Promise<MentionedIn[]> {
	const [notes, journal] = await Promise.all([
		deps.mentions.listNoteMentionsOfVisibleTo(viewer, contactId),
		deps.mentions.listJournalMentionsOfVisibleTo(viewer, contactId)
	]);
	return collectMentions([notes, journal], contactId);
}
