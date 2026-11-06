import type { ContactAccess, Remover, Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { ActivityOf } from '../activity/activity';
import type { MergeableProfile } from './merge-profile';
import type { NameRepository } from './name-parts';
import type { WithoutLastNameRepository } from './without-last-name';
import type { IdGenerator } from '../../id';
import type { Gender } from '../../../people/gender';
import type { Job } from '../../../people/job';
import type { Locale } from '../../../i18n/locales';
import type { DatePrecision } from '../../../dates/partial-date';

/*
 * Contact use-cases (docs/02 §2.2). Framework-agnostic orchestration over the
 * ContactRepository port; ids, clock, and persistence are injected (docs/08 §8.3). Adding a
 * person lives in `create-contact.ts`, editing a profile in place in `profile.ts`.
 */

/** How much of a birth date is actually known (docs/03 §3.4). */
export type BirthDatePrecision = DatePrecision;

export interface ContactCreator {
	userId: string;
	householdId: string;
	defaultVisibility: Visibility;
	/** The language the shown name is written in — its nickname's quote marks (docs/02 §2.2). */
	locale: Locale;
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
	gender?: Gender | null;
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
	gender: Gender | null;
	createdAt: number;
	updatedAt: number;
}

/** Full contact as read back for a profile. */
export interface Contact extends NewContact {
	/** A maiden or earlier last name (docs/02 §2.2); kept when a last name changes on request. */
	formerName: string | null;
	/** What they do and where, both free text (docs/02 §2.2). */
	jobTitle: string | null;
	company: string | null;
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

/** What tells namesakes apart (docs/02 §2.2.3), as stored. */
export interface DistinguishableContact extends ContactName {
	lastName: string | null;
	description: string | null;
	metPlace: string | null;
	metDate: string | null;
}

/** Row shape for list views. */
export interface ContactSummary {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	/** A maiden or other earlier name, which finds them too (docs/02 §2.2). */
	formerName: string | null;
	description: string | null;
	/** Where and when they were met — with the description, what tells namesakes apart (docs/02 §2.2.3). */
	metPlace: string | null;
	metDate: string | null;
	visibility: Visibility;
	avatarPhotoId: string | null;
	/**
	 * The stored birth date, at whatever precision it was entered (docs/03 §3.4) — a list
	 * entry says who somebody is, and for a child that includes when they were born.
	 */
	birthDate: string | null;
	/** What they do and where: shown on its own line, and found by (docs/02 §2.2). */
	jobTitle: string | null;
	company: string | null;
}

/** The fields the hero edits in place, already normalised. */
/** The hero's description; the name is never part of it (`editNameParts` writes names). */
export interface ProfilePatch {
	description: string | null;
	updatedAt: number;
}

/**
 * The contact record's writes, and the one-record reads they rest on (docs/08 §8.3). The lists
 * are read models of their own: `ContactDirectoryReads` (directory.ts) and `ContactNameReads`
 * (contact-names.ts). It writes names and *no last name* too, so it is the `NameRepository` and
 * the `WithoutLastNameRepository` the name use-cases take.
 */
export interface ContactRepository extends NameRepository, WithoutLastNameRepository {
	insert(contact: NewContact): Promise<void>;
	findByIdVisibleTo(viewer: Viewer, id: string): Promise<Contact | null>;
	/*
	 * The record's field writes. Each asks visibility again in its own statement and returns
	 * false when the viewer does not see the contact — the read a use-case makes first may be
	 * a moment old (docs/03 §3.7).
	 */
	/** Write the hero's own fields. */
	updateProfile(viewer: Viewer, id: string, patch: ProfilePatch): Promise<boolean>;
	/** Record a gender, or none. */
	setGender(viewer: Viewer, id: string, gender: Gender | null, updatedAt: number): Promise<boolean>;
	/** Write both job fields at once. */
	setJob(viewer: Viewer, id: string, job: Job, updatedAt: number): Promise<boolean>;
	/** Stamp or clear `archived_at`. */
	setArchived(viewer: Viewer, id: string, archivedAt: number | null): Promise<boolean>;
	/**
	 * Delete the contact and everything hanging off it, writing `audit` in the same
	 * transaction — a deletion that left no trace is the one this log exists to prevent.
	 * Returns the files to unlink, or null when the remover may not delete the contact
	 * (`canDeleteContact`, asked again inside the write).
	 */
	deleteDeletableBy(
		remover: Remover,
		id: string,
		audit: ActivityOf<'contact.deleted'>
	): Promise<DeletedContactMedia[] | null>;
	/** Both records as a merge needs them, or null when either is out of the viewer's reach. */
	readForMerge(viewer: Viewer, keepId: string, mergedId: string): Promise<MergePair | null>;
	/**
	 * Move everything from one record onto the other, write the merged profile, delete the
	 * emptied record and log it — all in one transaction. False when the remover may not merge
	 * the two (`canMergeContacts`, asked again inside the write).
	 */
	mergeMergeableBy(
		remover: Remover,
		keepId: string,
		mergedId: string,
		profile: MergeableProfile,
		audit: ActivityOf<'contact.merged'>,
		updatedAt: number
	): Promise<boolean>;
}

export interface ContactDeps {
	contacts: ContactRepository;
	ids: IdGenerator;
	clock: Clock;
}

/**
 * Looking one person up, visibility applied — the one port other contexts read contacts
 * through, so none of them needs the repository's writes (AR-06, docs/08 §8.3).
 */
export type ContactLookup = Pick<ContactRepository, 'findByIdVisibleTo'>;

/** All a caller that only checks visibility needs to hand in. */
export interface ContactLookupDeps {
	contacts: ContactLookup;
}

/** The two records a merge is about, with the names the log will have to remember. */
/** One side of a merge: who may merge it, what the log names it, and what it says. */
export interface MergeSide {
	access: ContactAccess;
	displayName: string;
	profile: MergeableProfile;
}

export interface MergePair {
	keep: MergeSide;
	mergedAway: MergeSide;
}

/** The bytes a deleted contact leaves behind: one pair per photo that hung off them. */
export interface DeletedContactMedia {
	filePath: string;
	thumbPath: string;
}

/** Fetch a contact the viewer may see, or null. */
export async function getContact(
	deps: ContactLookupDeps,
	viewer: Viewer,
	id: string
): Promise<Contact | null> {
	return deps.contacts.findByIdVisibleTo(viewer, id);
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
	return deps.contacts.setArchived(viewer, id, archivedAt);
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
