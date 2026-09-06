import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import {
	describeContactDeletion,
	type NewActivityEntry
} from '../activity/activity';
import type { MediaStore } from '../media/avatars';
import type { IdGenerator } from '../../id';
import { deriveDisplayName } from './display-name';

/*
 * Contact use-cases (docs/02 §2.2). Framework-agnostic orchestration over the
 * ContactRepository port; ids, clock, and persistence are injected (docs/08 §8.3).
 */

export interface ContactCreator {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
}

/** Input accepted from quick-add or the full contact form; all fields optional but a name is required. */
export interface CreateContactInput {
	displayName?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
	description?: string | null;
	howWeMet?: string | null;
	metDate?: string | null;
	metPlace?: string | null;
	/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is unknown. */
	birthDate?: string | null;
	visibility?: Visibility;
}

/** A contact ready to persist. */
export interface NewContact {
	id: string;
	householdId: string;
	createdBy: string;
	visibility: Visibility;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	description: string | null;
	howWeMet: string | null;
	metDate: string | null;
	metPlace: string | null;
	birthDate: string | null;
	birthDatePrecision: BirthDatePrecision;
	createdAt: number;
	updatedAt: number;
}

/** Full contact as read back for a profile. */
export interface Contact extends NewContact {
	avatarPhotoId: string | null;
	isDeceased: boolean;
	/** When the household put them out of the way, or null while they are in it. */
	archivedAt: number | null;
}

/** Just enough to name a contact, for resolving an @-mention. */
export interface ContactName {
	id: string;
	displayName: string;
}

/** Row shape for list views. */
export interface ContactSummary {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	description: string | null;
	visibility: Visibility;
	avatarPhotoId: string | null;
}

/** The fields the hero edits in place, already normalised. */
export interface ProfilePatch {
	displayName: string;
	description: string | null;
	updatedAt: number;
}

export interface ContactRepository {
	insert(contact: NewContact): Promise<void>;
	findByIdVisibleTo(viewer: Viewer, id: string): Promise<Contact | null>;
	listVisibleTo(viewer: Viewer): Promise<ContactSummary[]>;
	/** The archived ones, which every other list leaves out (docs/02 §2.2). */
	listArchivedVisibleTo(viewer: Viewer): Promise<ContactSummary[]>;
	/**
	 * Id and name of every contact the viewer may see, **archived ones included** — for
	 * resolving an @-mention already written. Archiving takes someone out of the lists, not
	 * out of the sentences that name them (docs/02 §2.2).
	 */
	listNamesVisibleTo(viewer: Viewer): Promise<ContactName[]>;
	/** Write the hero's own fields; the caller has already checked the contact is visible. */
	updateProfile(id: string, patch: ProfilePatch): Promise<void>;
	/** Stamp or clear `archived_at`; the caller has already checked the contact is visible. */
	setArchived(id: string, archivedAt: number | null): Promise<void>;
	/**
	 * Delete the contact and everything hanging off it, writing `audit` in the same
	 * transaction — a deletion that left no trace is the one this log exists to prevent.
	 * Returns the files to unlink, or null when the viewer may not see the contact.
	 */
	deleteVisibleTo(
		viewer: Viewer,
		id: string,
		audit: NewActivityEntry
	): Promise<DeletedContactMedia[] | null>;
}

export interface ContactDeps {
	contacts: ContactRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** The bytes a deleted contact leaves behind: one pair per photo that hung off them. */
export interface DeletedContactMedia {
	filePath: string;
	thumbPath: string;
}

/** How much of a birth date is actually known (docs/03 §3.2). */
export type BirthDatePrecision = 'full' | 'month_day' | 'year' | 'age';

/** A birth date is a full ISO day or a year-less `--MM-DD`. */
const BIRTH_DATE = /^(\d{4}-\d{2}-\d{2}|--\d{2}-\d{2})$/;

/** Thrown when a birth date is not a shape we can compute a birthday from. */
export class InvalidBirthDateError extends Error {
	constructor() {
		super('A birth date must be YYYY-MM-DD, or --MM-DD when the year is unknown.');
		this.name = 'InvalidBirthDateError';
	}
}

/** Parse an optional birth date into its stored value and precision. */
function parseBirthDate(value?: string | null): {
	birthDate: string | null;
	birthDatePrecision: BirthDatePrecision;
} {
	const trimmed = (value ?? '').trim();
	if (trimmed.length === 0) return { birthDate: null, birthDatePrecision: 'full' };
	if (!BIRTH_DATE.test(trimmed)) throw new InvalidBirthDateError();
	return {
		birthDate: trimmed,
		birthDatePrecision: trimmed.startsWith('--') ? 'month_day' : 'full'
	};
}

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Create a contact, deriving its display name and defaulting its visibility. */
export async function createContact(
	deps: ContactDeps,
	creator: ContactCreator,
	input: CreateContactInput
): Promise<string> {
	const displayName = deriveDisplayName(input);
	const { birthDate, birthDatePrecision } = parseBirthDate(input.birthDate);
	const now = deps.clock.now();
	const id = deps.ids.next();

	const contact: NewContact = {
		id,
		householdId: creator.householdId,
		createdBy: creator.userId,
		visibility: input.visibility ?? creator.defaultVisibility,
		displayName,
		firstName: orNull(input.firstName),
		lastName: orNull(input.lastName),
		nickname: orNull(input.nickname),
		description: orNull(input.description),
		howWeMet: orNull(input.howWeMet),
		metDate: orNull(input.metDate),
		metPlace: orNull(input.metPlace),
		birthDate,
		birthDatePrecision,
		createdAt: now,
		updatedAt: now
	};

	await deps.contacts.insert(contact);
	return id;
}

/** Why a nameless contact is refused; the edge shows this to whoever typed the blank. */
export const EMPTY_CONTACT_NAME_MESSAGE = 'A name cannot be empty.';

/** Thrown when an edit would leave a contact with no name at all. */
export class EmptyContactNameError extends Error {
	constructor() {
		super(EMPTY_CONTACT_NAME_MESSAGE);
		this.name = 'EmptyContactNameError';
	}
}

/** What the hero may change without opening a form (docs/02 §2.2). */
export interface ProfileEdit {
	displayName: string;
	description: string | null;
}

/**
 * Rename a contact or reword their description, in place. Returns false when the contact is
 * not visible to the viewer, so a route answers 404 the same way it does for a missing one —
 * the visibility check is the read, exactly as everywhere else (docs/03 §3.7).
 */
export async function editProfile(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	edit: ProfileEdit
): Promise<boolean> {
	const displayName = (edit.displayName ?? '').trim();
	if (displayName.length === 0) throw new EmptyContactNameError();

	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	await deps.contacts.updateProfile(id, {
		displayName,
		description: orNull(edit.description),
		updatedAt: deps.clock.now()
	});
	return true;
}

/** Fetch a contact the viewer may see, or null. */
export async function getContact(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer,
	id: string
): Promise<Contact | null> {
	return deps.contacts.findByIdVisibleTo(viewer, id);
}

/** List the contacts visible to the viewer. */
export async function listContacts(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer
): Promise<ContactSummary[]> {
	return deps.contacts.listVisibleTo(viewer);
}

/**
 * Resolve @-mentions written in a note, journal entry or moment. Uses the *visibility*
 * scope, not the browsing one: an archived person is out of the pickers, but a sentence
 * that already names them must keep naming them rather than reading "@unknown".
 */
export async function listContactNames(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer
): Promise<ContactName[]> {
	return deps.contacts.listNamesVisibleTo(viewer);
}

/** List the archived contacts — the only read that shows them as a list. */
export async function listArchivedContacts(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer
): Promise<ContactSummary[]> {
	return deps.contacts.listArchivedVisibleTo(viewer);
}

/**
 * Put a contact out of the way, or bring them back. Archiving hides someone from the
 * surfaces the household browses; it does not hide them from the graph or from the
 * relatives Stella works out (docs/04 §4.9). Returns false when the contact is not visible
 * to the viewer, so the route answers as it does for one that is not there.
 */
async function setArchived(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	archivedAt: number | null
): Promise<boolean> {
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;
	await deps.contacts.setArchived(id, archivedAt);
	return true;
}

/** Archive a contact, stamping the moment it happened. */
export async function archiveContact(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string
): Promise<boolean> {
	return setArchived(deps, viewer, id, deps.clock.now());
}

/** Bring an archived contact back into the household's lists. */
export async function restoreContact(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string
): Promise<boolean> {
	return setArchived(deps, viewer, id, null);
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
	deps: Pick<ContactDeps, 'contacts' | 'ids' | 'clock'> & { media: Pick<MediaStore, 'delete'> },
	viewer: Viewer,
	id: string
): Promise<boolean> {
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	const files = await deps.contacts.deleteVisibleTo(viewer, id, {
		id: deps.ids.next(),
		householdId: viewer.householdId,
		actorId: viewer.id,
		action: 'delete',
		entityType: 'contact',
		entityId: id,
		// The person this was "about" is the one being deleted, so there is nothing to link to.
		contactId: null,
		visibility: contact.visibility,
		summary: describeContactDeletion(contact.displayName),
		createdAt: deps.clock.now()
	});
	if (files === null) return false;

	for (const file of files) {
		await deps.media.delete(file.filePath);
		await deps.media.delete(file.thumbPath);
	}
	return true;
}
