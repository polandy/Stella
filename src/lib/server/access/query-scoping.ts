import { and, eq, isNull, or, type AnyColumn, type SQL } from 'drizzle-orm';
import { activityLog, circle, contact } from '../db/schema';
import type { Remover, Viewer } from './visibility';

/*
 * Query-scoping adapter — the SQL expression of the pure rules in `visibility.ts`
 * (docs/03 §3.7, docs/08 §8.3). It produces Drizzle WHERE conditions so list queries
 * are filtered in the database instead of loading everything and filtering in memory.
 *
 * These builders are the *adapter*; `visibility.ts` is the domain rule.
 * `visibility-parity.test.ts` asserts the two stay equivalent for every viewer.
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
 * Condition for the surfaces the household *browses*: visible, and not archived. Archiving
 * takes someone out of the directory, the search, the pickers and the Home bands — but not
 * out of the graph or the relatives Stella works out, which keep reading `contactVisibleTo`
 * (docs/04 §4.9). Anything that lists people to choose from or to be reminded of uses this;
 * anything that reasons about the household's shape does not.
 */
export function contactBrowsableBy(viewer: Viewer): SQL {
	return and(contactVisibleTo(viewer), isNull(contact.archivedAt))!;
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
 * Condition for an authored record (note / journal entry / interaction / photo) being one the
 * remover may remove — the SQL of `canRemoveAuthored`: visible, and their own or, for an
 * admin, shared. The query must join `contact`.
 */
export function authoredRemovableBy(
	remover: Remover,
	record: { visibility: AnyColumn; createdBy: AnyColumn }
): SQL {
	const own = eq(record.createdBy, remover.id);
	return and(
		childRecordVisibleTo(remover, record),
		remover.isAdmin ? or(own, eq(record.visibility, 'shared')) : own
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

/**
 * Condition for a photo of a circle's gallery being visible: its circle must be visible (the
 * query must join `circle`), and a private photo only to whoever added it.
 */
export function circlePhotoVisibleTo(
	viewer: Viewer,
	record: { visibility: AnyColumn; createdBy: AnyColumn }
): SQL {
	return circlePhotoColumnsVisibleTo(viewer, circle, record);
}

/** `circlePhotoVisibleTo` over an aliased circle, for a query that already joins `circle` otherwise. */
export function circlePhotoColumnsVisibleTo(
	viewer: Viewer,
	circleColumns: ContactColumns,
	record: { visibility: AnyColumn; createdBy: AnyColumn }
): SQL {
	return and(
		circleColumnsVisibleTo(viewer, circleColumns),
		or(eq(record.visibility, 'shared'), eq(record.createdBy, viewer.id))
	)!;
}

/**
 * Condition for an `activity_log` entry being visible: same household, and either shared or
 * the viewer's own action. The entry is scoped by itself — what it describes may be gone.
 */
export function activityVisibleTo(viewer: Viewer): SQL {
	return and(
		eq(activityLog.householdId, viewer.householdId),
		or(eq(activityLog.visibility, 'shared'), eq(activityLog.actorId, viewer.id))
	)!;
}
