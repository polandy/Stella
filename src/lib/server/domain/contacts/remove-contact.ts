import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { activityRecord } from '../activity/activity';
import type { ContactRepository } from './contacts';
import { mergeProfiles } from './merge-profile';

/*
 * Ending a record: deleting a person for good, or merging a duplicate into them (docs/02 §2.2).
 *
 * What hangs off a contact — notes, photos, dates, links, journal — goes with it through the
 * database's `ON DELETE CASCADE` and the repository's one transaction, not through the sibling
 * contexts: this module knows none of them (docs/04 ADR-121). The one cascade the domain runs
 * itself is unlinking the photo bytes, which no transaction can take back, through a port this
 * context declares — so `contacts` depends on nothing in `media`.
 */

/** Where a deleted person's photo files are unlinked; the media store fulfils it. */
export interface PhotoFileCascade {
	delete(path: string): Promise<void>;
}

/** Deleting a person also unlinks the bytes of their photos (docs/02 §2.2). */
export interface DeleteContactDeps {
	contacts: Pick<ContactRepository, 'findByIdVisibleTo' | 'deleteVisibleTo'>;
	photoFiles: PhotoFileCascade;
	ids: IdGenerator;
	clock: Clock;
}

/** Merging reads both records, then moves and logs everything in the repository's one write. */
export interface MergeContactDeps {
	contacts: Pick<ContactRepository, 'readForMerge' | 'mergeVisibleTo'>;
	ids: IdGenerator;
	clock: Clock;
}

/**
 * Delete a person and everything that hangs off them — notes, photos, dates, relationships,
 * journal — for good. The row and its log entry go in one transaction; the bytes follow,
 * because a file left behind is the harmless direction of that failure while a delete with
 * no trace is not (docs/02 §2.2).
 *
 * Returns false when the contact is not visible to the viewer, exactly as for one that is
 * not there. *Who* may delete is decided at the edge: this is admin-only (docs/02 §2.2).
 */
export async function deleteContact(
	deps: DeleteContactDeps,
	viewer: Viewer,
	id: string
): Promise<boolean> {
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	const files = await deps.contacts.deleteVisibleTo(
		viewer,
		id,
		activityRecord(deps, viewer, {
			kind: 'contact.deleted',
			contactId: id,
			displayName: contact.displayName,
			visibility: contact.visibility
		})
	);
	if (files === null) return false;

	for (const file of files) {
		await deps.photoFiles.delete(file.filePath);
		await deps.photoFiles.delete(file.thumbPath);
	}
	return true;
}

/**
 * Merge one person into another: the survivor keeps their name and their visibility, gains
 * whatever the other record said that they did not (`mergeProfiles`), and takes over every
 * note, photo, date, link and journal entry. The emptied record is then deleted and the merge
 * written to the log — the only trace left of a name that used to exist (docs/02 §2.2).
 *
 * Returns false when either record is out of the viewer's reach, or when the two are the same.
 */
export async function mergeContacts(
	deps: MergeContactDeps,
	viewer: Viewer,
	keepId: string,
	mergedId: string
): Promise<boolean> {
	if (keepId === mergedId) return false;

	const pair = await deps.contacts.readForMerge(viewer, keepId, mergedId);
	if (pair === null) return false;

	const now = deps.clock.now();
	return deps.contacts.mergeVisibleTo(
		viewer,
		keepId,
		mergedId,
		mergeProfiles(pair.keep.profile, pair.mergedAway.profile),
		activityRecord(
			deps,
			viewer,
			{
				kind: 'contact.merged',
				keepId,
				mergedAwayId: mergedId,
				keep: pair.keep.displayName,
				mergedAway: pair.mergedAway.displayName,
				visibility: pair.keep.visibility
			},
			now
		),
		now
	);
}
