import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { ContactGoneError } from '../contacts/require-visible';
import { isImmichId } from './gateway';
import { ImmichLinkRefusedError, type LinkVisibleContacts } from './links';

/*
 * Proposals of *Find your people* a member turned down (docs/concepts/immich.md §9, docs/02
 * §2.24.7): "this contact is not that Immich person". Household data like a link — any member
 * who sees the contact may ignore a pair or take it back, and the record has no visibility of its
 * own: whoever sees the contact sees it. It says who ignored the pair and when, so the list can
 * show it rather than having proposals silently vanish.
 *
 * It is about the pair, never the face or the person alone: the face stays free for anyone else,
 * and the contact for any other face. Linking the contact later leaves the record alone; it
 * simply no longer matters, since a linked contact is not proposed at all.
 */

/** One ignored pair. */
export interface ImmichIgnore {
	contactId: string;
	immichPersonId: string;
	/** The member who ignored it. */
	ignoredBy: string;
	ignoredAt: number;
}

/** Where ignored pairs are kept. Reads and removals are scoped to what the viewer may see. */
export interface ImmichIgnoreRepository {
	/** The ignored pairs whose contact the viewer sees. */
	listVisibleTo(viewer: Viewer): Promise<ImmichIgnore[]>;
	/** Keeps the pairs; one already kept keeps its first record (who, when). */
	save(ignores: readonly ImmichIgnore[]): Promise<void>;
	/** Removes one pair, only when the viewer sees its contact; false when nothing was removed. */
	remove(viewer: Viewer, contactId: string, immichPersonId: string): Promise<boolean>;
}

export interface ImmichIgnoreDeps {
	ignores: ImmichIgnoreRepository;
	contacts: LinkVisibleContacts;
	clock: Clock;
}

/** More faces than any one row of the list shows; a post with more is not from the list. */
const MAX_FACES_PER_ROW = 50;

type Actor = { userId: string; householdId: string };

/**
 * Ignore a row of the list: the contact with each face the row showed. A maybe row with several
 * faces ignores all of them for this contact, and nothing beyond them.
 */
export async function ignoreMatch(
	deps: ImmichIgnoreDeps,
	actor: Actor,
	contactId: string,
	immichPersonIds: readonly string[]
): Promise<void> {
	const viewer: Viewer = { id: actor.userId, householdId: actor.householdId };
	if (!(await deps.contacts.findByIdVisibleTo(viewer, contactId))) throw new ContactGoneError();
	if (
		immichPersonIds.length === 0 ||
		immichPersonIds.length > MAX_FACES_PER_ROW ||
		!immichPersonIds.every(isImmichId)
	)
		throw new ImmichLinkRefusedError('notFound');

	const ignoredAt = deps.clock.now();
	await deps.ignores.save(
		[...new Set(immichPersonIds)].map((immichPersonId) => ({
			contactId,
			immichPersonId,
			ignoredBy: actor.userId,
			ignoredAt
		}))
	);
}

/** *Propose again*: forget that the pair was ignored. Needs nothing from Immich. */
export function proposeAgain(
	deps: Pick<ImmichIgnoreDeps, 'ignores'>,
	viewer: Viewer,
	contactId: string,
	immichPersonId: string
): Promise<boolean> {
	return deps.ignores.remove(viewer, contactId, immichPersonId);
}
