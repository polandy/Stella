import type { Remover } from '../../access/visibility';
import { activityRecord } from '../activity/activity';
import type { NoteDeps } from './notes';

/*
 * Removing a note (docs/02 §2.5, docs/03 §3.7): its author always, an admin of the household
 * when it is shared. A removal by someone other than the author is told to the household in
 * the delete's own transaction; an author tidying up their own words is not.
 */

/**
 * Remove a note; whether it went. A note that is gone and one the remover may not touch answer
 * alike, so a foreign id reveals nothing — and a held removal reads either as done (§2.23).
 */
export async function removeNote(deps: NoteDeps, remover: Remover, id: string): Promise<boolean> {
	const found = await deps.notes.findRemovableBy(remover, id);
	if (!found) return false;

	const audit =
		found.authorId === remover.id
			? null
			: activityRecord(deps, remover, {
					kind: 'record.removed',
					recordKind: 'note',
					recordId: found.id,
					contactId: found.contactId,
					person: found.person,
					authorId: found.authorId,
					authorName: found.authorName,
					// The note was shared, or the remover could not be removing it; the person may not be.
					visibility: found.personVisibility
				});
	return deps.notes.deleteRemovableBy(remover, id, audit);
}
