import type { Remover, Visibility } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { RemovedRecordKind } from '../../../stream/notices';
import { activityRecord, type ActivityOf } from './activity';

/*
 * Removing an authored record (docs/03 §3.7) is the same story for every kind: the repository
 * finds what the remover may remove, and when that is someone else's work the household is told
 * in the delete's own transaction. This is the telling, so each kind says it once and alike.
 */

/** What a removal needs to know of a record it may remove. */
export interface RemovableRecord {
	id: string;
	/** The person it was on; null for a photo of a circle. */
	contactId: string | null;
	/** The person's name, or the circle's — kept because the log line outlives the record. */
	person: string;
	/** The person's (or circle's) visibility; the record itself was shared or it is the author's. */
	personVisibility: Visibility;
	authorId: string;
	authorName: string;
}

/**
 * The activity entry a removal writes: none for an author tidying up their own record, one
 * for anyone else — naming the kind, the place and both members, never the text.
 */
export function removalAudit(
	deps: { ids: IdGenerator; clock: Clock },
	remover: Remover,
	recordKind: RemovedRecordKind,
	found: RemovableRecord
): ActivityOf<'record.removed'> | null {
	if (found.authorId === remover.id) return null;
	return activityRecord(deps, remover, {
		kind: 'record.removed',
		recordKind,
		recordId: found.id,
		contactId: found.contactId,
		person: found.person,
		authorId: found.authorId,
		authorName: found.authorName,
		visibility: found.personVisibility
	});
}
