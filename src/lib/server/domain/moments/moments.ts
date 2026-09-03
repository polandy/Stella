import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	createHandleResolver,
	extractHandles,
	mentionKey,
	resolveMentions,
	type MentionCandidate
} from '../../../mentions/mentions';
import { createContact, type ContactRepository, type ContactSummary } from '../contacts/contacts';
import {
	saveJournalEntry,
	setJournalMentions,
	type JournalAuthor,
	type JournalRepository
} from '../journal/journal';

/*
 * Moments (docs/02 §2.22.1): the one-sentence capture. A moment *is* a journal entry — the
 * first person mentioned is the entry's contact (the anchor whose journal it lands in), every
 * other mention is stored as a journal_mention. People the composer queued for inline creation
 * are created first, so their handle resolves like anyone else's. Pure orchestration over the
 * contact + journal ports; the visibility-scoped reads live in the adapters.
 */

export interface CaptureMomentInput {
	/** Markdown body with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	/** ISO `YYYY-MM-DD` day the moment is about. */
	entryDate: string;
	visibility: Visibility;
	/** Display names the composer queued via "Create “Name”"; created only if mentioned. */
	newPeople: string[];
}

export interface CaptureMomentDeps {
	contacts: ContactRepository;
	journal: JournalRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface CapturedMoment {
	entryId: string;
	/** The contact whose journal the moment landed in (first mention). */
	anchorContactId: string;
	/** The other people referenced, in first-seen order. */
	mentionedContactIds: string[];
	/** People created inline for this moment. */
	createdContactIds: string[];
	/** The first two people in the moment, offered for linking afterwards (§2.22.1), or null. */
	linkSuggestion: [string, string] | null;
}

/** Thrown when a moment references nobody — a moment needs at least one person. */
export class MomentNeedsPersonError extends Error {
	constructor() {
		super('Mention at least one person with @ so the moment has a place to go.');
		this.name = 'MomentNeedsPersonError';
	}
}

/**
 * People an entry of the given visibility may reference (docs/02 §2.20.1): a shared entry only
 * household-visible contacts, a private entry anyone the author can see — so a mention never
 * widens access. Shared by the moment capture and the journal route.
 */
export function audienceCandidates(
	contacts: ContactSummary[],
	visibility: Visibility
): MentionCandidate[] {
	return (visibility === 'shared' ? contacts.filter((c) => c.visibility === 'shared') : contacts).map(
		(c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, displayName: c.displayName })
	);
}

/**
 * Capture a moment: create the queued people the body actually mentions, resolve every
 * handle against the moment's audience, save the entry on the first person mentioned and link
 * the rest. A person created inline takes the moment's visibility, so a shared moment can
 * always reference the people it just introduced.
 */
export async function captureMoment(
	deps: CaptureMomentDeps,
	author: JournalAuthor,
	input: CaptureMomentInput
): Promise<CapturedMoment> {
	const body = input.body.trim();
	if (body.length === 0) throw new MomentNeedsPersonError();
	const viewer: Viewer = { id: author.userId, householdId: author.householdId };

	const mentionedKeys = new Set(extractHandles(body).map(mentionKey));
	const existingKeys = new Set(
		(await deps.contacts.listVisibleTo(viewer)).map((c) => mentionKey(c.displayName))
	);

	// Create only queued names that are both mentioned and not already someone visible.
	const createdContactIds: string[] = [];
	const queued = new Set<string>();
	for (const name of input.newPeople) {
		const key = mentionKey(name);
		if (!key || queued.has(key) || existingKeys.has(key) || !mentionedKeys.has(key)) continue;
		queued.add(key);
		createdContactIds.push(
			await createContact(
				{ contacts: deps.contacts, ids: deps.ids, clock: deps.clock },
				{ userId: author.userId, householdId: author.householdId, defaultVisibility: input.visibility },
				{ displayName: name.trim(), visibility: input.visibility }
			)
		);
	}

	const candidates = audienceCandidates(await deps.contacts.listVisibleTo(viewer), input.visibility);
	const resolved = resolveMentions(body, createHandleResolver(candidates));
	if (resolved.ids.length === 0) throw new MomentNeedsPersonError();

	const [anchorContactId, ...mentionedContactIds] = resolved.ids;
	const journalDeps = { journal: deps.journal, ids: deps.ids, clock: deps.clock };
	const entryId = await saveJournalEntry(journalDeps, author, {
		contactId: anchorContactId,
		entryDate: input.entryDate,
		body: resolved.body,
		visibility: input.visibility
	});
	await setJournalMentions(journalDeps, entryId, mentionedContactIds);

	return {
		entryId,
		anchorContactId,
		mentionedContactIds,
		createdContactIds,
		linkSuggestion:
			mentionedContactIds.length > 0 ? [anchorContactId, mentionedContactIds[0]] : null
	};
}
