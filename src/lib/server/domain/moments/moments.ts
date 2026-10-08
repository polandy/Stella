import type { Locale } from '../../../i18n/locales';
import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { newPersonMentionId, type MomentNewPerson } from '../../../commands/commands';
import {
	extractHandles,
	mentionKey,
	mentionToken,
	mentionsOtherThan
} from '../../../mentions/mentions';
import { resolveForAudience } from '../mentions/resolve-for-audience';
import { createContact, type ContactRepository } from '../contacts/contacts';
import type { ContactDirectoryReads } from '../contacts/directory';
import { requireVisibleContact } from '../contacts/require-visible';
import { addToJournalDay, type JournalAuthor, type JournalRepository } from '../journal/journal';

/*
 * Moments (docs/02 §2.22.1): the one-sentence capture. A moment *is* a journal entry — the
 * first person mentioned is the entry's contact (the anchor whose journal it lands in), every
 * other mention is stored as a journal_mention. People the composer queued for inline creation
 * are created first, so their handle resolves like anyone else's. Pure orchestration over the
 * contact + journal ports; the visibility-scoped reads live in the adapters.
 *
 * Written on a person's own page, a moment carries that person as its `anchorId`: it lands in
 * their journal without an `@`, everyone else it names is a mention beside them, and naming the
 * anchor too adds no self-mention — as on the journal page (`writeJournalEntry`).
 */

export interface CaptureMomentInput {
	/** Markdown body with typed `@Handle`s and/or canonical mention tokens. */
	body: string;
	/** ISO `YYYY-MM-DD` day the moment is about. */
	entryDate: string;
	visibility: Visibility;
	/**
	 * People the composer created with the moment, each created only if the body mentions them:
	 * by the placeholder `@{contact:new:<key>}`, or — queued by an older build as a bare display
	 * name — by their `@Handle`.
	 */
	newPeople: (string | MomentNewPerson)[];
	/** The person whose page it was written on; absent, the first person mentioned. */
	anchorId?: string | null;
}

export interface CaptureMomentDeps {
	contacts: ContactRepository;
	/** Whom a handle can name — read again after the moment's new people are created. */
	directory: Pick<ContactDirectoryReads, 'listVisibleTo'>;
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
export class MomentNeedsPersonError extends TranslatableError {
	constructor() {
		super(phrase('errors.moment.needsPerson'), 'MomentNeedsPersonError');
	}
}

/**
 * Capture a moment: create the queued people the body actually mentions, resolve every
 * handle against the moment's audience, save the entry on the first person mentioned and link
 * the rest. A person created inline takes the moment's visibility, so a shared moment can
 * always reference the people it just introduced.
 */
export async function captureMoment(
	deps: CaptureMomentDeps,
	author: JournalAuthor & { locale: Locale },
	input: CaptureMomentInput
): Promise<CapturedMoment> {
	const body = input.body.trim();
	if (body.length === 0) throw new MomentNeedsPersonError();
	const viewer: Viewer = { id: author.userId, householdId: author.householdId };
	// Checked before anyone is created, so a refused moment leaves the household as it was.
	if (input.anchorId) await requireVisibleContact(deps.contacts, author, input.anchorId);

	const visible = await deps.directory.listVisibleTo(viewer);
	// A handle that is two people is asked about before anyone is created: a refused moment
	// must leave the household as it found it.
	resolveForAudience(visible, input.visibility, body);

	const mentionedKeys = new Set(extractHandles(body).map(mentionKey));
	const existingKeys = new Set(visible.map((c) => mentionKey(c.displayName)));

	const createdContactIds: string[] = [];
	const creator = {
		userId: author.userId,
		householdId: author.householdId,
		defaultVisibility: input.visibility,
		locale: author.locale
	};
	const contactDeps = { contacts: deps.contacts, ids: deps.ids, clock: deps.clock };

	// A person named with what tells them apart is created by their placeholder, never by name:
	// a second Thomas is as welcome as the first (docs/02 §2.2.3).
	let written = body;
	for (const person of input.newPeople) {
		if (typeof person === 'string') continue;
		const placeholder = mentionToken(newPersonMentionId(person.key));
		if (!written.includes(placeholder)) continue;
		const id = await createContact(contactDeps, creator, {
			firstName: person.firstName,
			lastName: person.lastName,
			description: person.description,
			visibility: input.visibility
		});
		createdContactIds.push(id);
		written = written.replaceAll(placeholder, mentionToken(id));
	}

	// Create only queued names that are both mentioned and not already someone visible.
	const queued = new Set<string>();
	for (const name of input.newPeople) {
		if (typeof name !== 'string') continue;
		const key = mentionKey(name);
		if (!key || queued.has(key) || existingKeys.has(key) || !mentionedKeys.has(key)) continue;
		queued.add(key);
		createdContactIds.push(
			await createContact(contactDeps, creator, {
				displayName: name.trim(),
				visibility: input.visibility
			})
		);
	}

	const resolved = resolveForAudience(
		await deps.directory.listVisibleTo(viewer),
		input.visibility,
		written
	);
	const { anchorContactId, mentionedContactIds } = anchorAndMentions(resolved.ids, input.anchorId);
	// A moment is an addition (§2.20): a day slot that already holds an entry gets it appended.
	const entryId = await addToJournalDay(
		{ journal: deps.journal, ids: deps.ids, clock: deps.clock },
		author,
		{
			contactId: anchorContactId,
			entryDate: input.entryDate,
			visibility: input.visibility,
			title: null,
			body: resolved.body,
			mentionIds: mentionedContactIds
		}
	);

	return {
		entryId,
		anchorContactId,
		mentionedContactIds,
		createdContactIds,
		linkSuggestion:
			mentionedContactIds.length > 0 ? [anchorContactId, mentionedContactIds[0]] : null
	};
}

/** Whose journal a moment lands in, and whom it mentions beside them. */
function anchorAndMentions(
	ids: string[],
	anchorId: string | null | undefined
): { anchorContactId: string; mentionedContactIds: string[] } {
	if (anchorId)
		return { anchorContactId: anchorId, mentionedContactIds: mentionsOtherThan(ids, anchorId) };
	const [anchorContactId, ...mentionedContactIds] = ids;
	if (!anchorContactId) throw new MomentNeedsPersonError();
	return { anchorContactId, mentionedContactIds };
}
