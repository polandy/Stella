/*
 * Central access-control rules — the single source of truth for "who may see what"
 * (docs/03-data-model.md §3.7, docs/02-features.md §2.10).
 *
 * These are pure functions with no dependencies: they operate on minimal access
 * descriptors, not DB rows or the framework. Every read/write in the domain layer is
 * filtered through them; nothing else authorizes record access.
 */

export type Visibility = 'shared' | 'private';
export type UserId = string;
export type HouseholdId = string;

/** The minimal identity needed to make an access decision. */
export interface Viewer {
	id: UserId;
	householdId: HouseholdId;
}

/** Visibility descriptor of a contact — the root of every access decision. */
export interface ContactAccess {
	householdId: HouseholdId;
	/** `created_by` — the household member who owns the contact. */
	ownerId: UserId;
	visibility: Visibility;
}

/** A record that hangs off a contact (note, photo, interaction). */
export interface ChildRecordAccess {
	/** `created_by` — the author of this child record. */
	ownerId: UserId;
	visibility: Visibility;
	/** The parent contact this record belongs to. */
	contact: ContactAccess;
}

/**
 * A contact is visible to a viewer in the same household when it is shared, or — if
 * private — only to its owner. Membership of a different household never grants access,
 * and being an admin grants no exception to another member's private records.
 */
export function canViewContact(viewer: Viewer, contact: ContactAccess): boolean {
	if (contact.householdId !== viewer.householdId) return false;
	if (contact.visibility === 'shared') return true;
	return contact.ownerId === viewer.id;
}

/**
 * A child record is visible only when its parent contact is visible (a private contact
 * hides its whole subtree, regardless of child visibility) and, additionally, a private
 * child is visible only to its author.
 */
export function canViewChildRecord(viewer: Viewer, record: ChildRecordAccess): boolean {
	if (!canViewContact(viewer, record.contact)) return false;
	if (record.visibility === 'private' && record.ownerId !== viewer.id) return false;
	return true;
}

/** A relationship is visible only when the viewer can see both of its endpoints. */
export function canViewRelationship(
	viewer: Viewer,
	endpoints: { from: ContactAccess; to: ContactAccess }
): boolean {
	return canViewContact(viewer, endpoints.from) && canViewContact(viewer, endpoints.to);
}
