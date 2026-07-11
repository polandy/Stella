import { and, eq, or, type AnyColumn, type SQL } from 'drizzle-orm';
import { contact } from '../db/schema';
import type { Viewer } from './visibility';

/*
 * Query-scoping adapter — the SQL expression of the pure rules in `visibility.ts`
 * (docs/03 §3.7, docs/08 §8.3). It produces Drizzle WHERE conditions so list queries
 * are filtered in the database instead of loading everything and filtering in memory.
 *
 * These builders are the *adapter*; `visibility.ts` is the domain rule. The integration
 * test asserts the two stay equivalent for every viewer.
 */

/** The contact columns an access decision depends on (works for the base table or an alias). */
export interface ContactColumns {
	householdId: AnyColumn;
	visibility: AnyColumn;
	createdBy: AnyColumn;
}

/**
 * Condition for "this contact (given by its columns) is visible to the viewer": same
 * household, and either shared or owned by the viewer. Accepts a column set so it works
 * on the base `contact` table and on aliases (e.g. relationship endpoints).
 */
export function contactColumnsVisibleTo(viewer: Viewer, columns: ContactColumns): SQL {
	return and(
		eq(columns.householdId, viewer.householdId),
		or(eq(columns.visibility, 'shared'), eq(columns.createdBy, viewer.id))
	)!;
}

/** Condition for the base `contact` table being visible to the viewer. */
export function contactVisibleTo(viewer: Viewer): SQL {
	return contactColumnsVisibleTo(viewer, contact);
}

/**
 * Condition for a child record (note / photo / interaction) being visible: its parent
 * contact must be visible (the query must join `contact`), and a private child is only
 * visible to its author.
 */
export function childRecordVisibleTo(
	viewer: Viewer,
	record: { visibility: AnyColumn; createdBy: AnyColumn }
): SQL {
	return and(
		contactVisibleTo(viewer),
		or(eq(record.visibility, 'shared'), eq(record.createdBy, viewer.id))
	)!;
}

/**
 * Condition for a relationship being visible: both endpoints must be visible. Pass the
 * two aliased contact tables the query joins on.
 */
export function relationshipVisibleTo(
	viewer: Viewer,
	fromContact: ContactColumns,
	toContact: ContactColumns
): SQL {
	return and(
		contactColumnsVisibleTo(viewer, fromContact),
		contactColumnsVisibleTo(viewer, toContact)
	)!;
}

/**
 * Condition for a circle being visible — same rule as a contact (household + shared-or-owned),
 * expressed over the circle's columns so it works on the base table or an alias.
 */
export function circleColumnsVisibleTo(viewer: Viewer, columns: ContactColumns): SQL {
	return contactColumnsVisibleTo(viewer, columns);
}

/**
 * Condition for a membership being visible: its circle and its contact must both be visible.
 * Pass the circle columns and the joined contact columns.
 */
export function membershipVisibleTo(
	viewer: Viewer,
	circle: ContactColumns,
	contact: ContactColumns
): SQL {
	return and(circleColumnsVisibleTo(viewer, circle), contactColumnsVisibleTo(viewer, contact))!;
}
