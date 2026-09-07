import type { Visibility } from '../../access/visibility';

/*
 * The household's activity log (docs/03 §activity_log). The stream is otherwise a query over
 * the tables that still exist (docs/02 §2.11) — which is why only **deletions** are logged:
 * once the row is gone, nothing else can say a person was ever there.
 */

/** What happened to the entity. Only `delete`, `merge` and `export` are written today. */
export type ActivityAction = 'create' | 'update' | 'delete' | 'archive' | 'merge' | 'export';

/** A log row as it is written. */
export interface NewActivityEntry {
	id: string;
	householdId: string;
	actorId: string;
	action: ActivityAction;
	entityType: string;
	/** Polymorphic and without a foreign key: the entity it names is usually gone. */
	entityId: string;
	contactId: string | null;
	/** Mirrors the affected record's visibility at write time, so the log leaks nothing. */
	visibility: Visibility;
	/** Precomputed, because the record it describes cannot be read back. */
	summary: string;
	createdAt: number;
}

/** What the log says about a deleted person; the name is kept because the row is not. */
export function describeContactDeletion(displayName: string): string {
	return `removed ${displayName}`;
}

/** What the log says about a merge; the record merged away no longer exists to be named. */
export function describeContactMerge(mergedAway: string, keep: string): string {
	return `merged ${mergedAway} into ${keep}`;
}
