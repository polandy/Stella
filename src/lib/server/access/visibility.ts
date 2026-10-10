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

/**
 * Who is removing a record (docs/03 §3.7): a viewer, plus whether they are an admin of the
 * household — the one thing about a member the visibility rules never look at.
 */
export interface Remover extends Viewer {
	isAdmin: boolean;
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

/**
 * An authored record (note, journal entry, touchpoint, person photo) may be removed by its
 * author, always, and by an admin when it is shared. Both must see it first: an admin gains
 * nothing on a private record, which they cannot see (docs/02 §2.10).
 */
export function canRemoveAuthored(remover: Remover, record: ChildRecordAccess): boolean {
	if (!canViewChildRecord(remover, record)) return false;
	if (record.ownerId === remover.id) return true;
	return remover.isAdmin && record.visibility === 'shared';
}

/**
 * An authored record may be edited by its author alone, and only while they still see it: an
 * admin removes another member's shared record but never rewrites it (docs/02 §2.5).
 */
export function canEditAuthored(viewer: Viewer, record: ChildRecordAccess): boolean {
	return canViewChildRecord(viewer, record) && record.ownerId === viewer.id;
}

/** A relationship is visible only when the viewer can see both of its endpoints. */
export function canViewRelationship(
	viewer: Viewer,
	endpoints: { from: ContactAccess; to: ContactAccess }
): boolean {
	return canViewContact(viewer, endpoints.from) && canViewContact(viewer, endpoints.to);
}

/** A circle (shared context) is a first-class shareable record, scoped like a contact. */
export interface CircleAccess {
	householdId: HouseholdId;
	/** `created_by` — the household member who owns the circle. */
	ownerId: UserId;
	visibility: Visibility;
}

export function canViewCircle(viewer: Viewer, circle: CircleAccess): boolean {
	if (circle.householdId !== viewer.householdId) return false;
	if (circle.visibility === 'shared') return true;
	return circle.ownerId === viewer.id;
}

/** A membership is visible only when the viewer can see both its circle and its contact. */
export function canViewMembership(
	viewer: Viewer,
	membership: { circle: CircleAccess; contact: ContactAccess }
): boolean {
	return canViewCircle(viewer, membership.circle) && canViewContact(viewer, membership.contact);
}

/** A photo in a circle's gallery (docs/02 §2.4.2): it hangs off the circle, not a contact. */
export interface CirclePhotoAccess {
	/** `created_by` — who added the photo. */
	ownerId: UserId;
	visibility: Visibility;
	circle: CircleAccess;
}

/**
 * A circle photo is visible only when its circle is visible (a private circle's photos are
 * private with it) and, additionally, a private photo only to whoever added it — the
 * child-record rule with the circle in the contact's place.
 */
export function canViewCirclePhoto(viewer: Viewer, photo: CirclePhotoAccess): boolean {
	if (!canViewCircle(viewer, photo.circle)) return false;
	return photo.visibility === 'shared' || photo.ownerId === viewer.id;
}

/**
 * A circle photo may be removed by whoever added it, always, and by an admin when it is
 * shared — `canRemoveAuthored` with the circle in the contact's place. Both must see it.
 */
export function canRemoveCirclePhoto(remover: Remover, photo: CirclePhotoAccess): boolean {
	if (!canViewCirclePhoto(remover, photo)) return false;
	if (photo.ownerId === remover.id) return true;
	return remover.isAdmin && photo.visibility === 'shared';
}

/**
 * An activity-log entry (docs/03 §activity_log). It outlives what it describes — a deleted or
 * merged contact, an export that never had a row — so there is no record left to scope through;
 * the entry carries the visibility the affected record had, and `actorId` is its author.
 */
export interface ActivityAccess {
	householdId: HouseholdId;
	/** `actor_id` — the household member who did it. */
	actorId: UserId;
	visibility: Visibility;
}

/** An activity entry is visible within its household when shared, else only to its actor. */
export function canViewActivity(viewer: Viewer, entry: ActivityAccess): boolean {
	if (entry.householdId !== viewer.householdId) return false;
	return entry.visibility === 'shared' || entry.actorId === viewer.id;
}
