import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import {
	describeContactDeletion,
	describeContactMerge,
	type NewActivityEntry
} from '../activity/activity';
import { mergeProfiles, type MergeableProfile } from './merge-profile';
import type { MediaStore } from '../media/avatars';
import type { IdGenerator } from '../../id';
import { deriveDisplayName } from '../../../people/display-name';
import { isKnownByMoreThanAFirstName } from '../../../people/new-person';
import { isGender, type Gender } from '../../../people/gender';
import { JOB_FIELD_MAX_LENGTH, type Job } from '../../../people/job';
import type { Locale } from '../../../i18n/locales';
import { isKnownByAFirstNameOnly } from '../../../people/namesakes';

/*
 * Contact use-cases (docs/02 §2.2). Framework-agnostic orchestration over the
 * ContactRepository port; ids, clock, and persistence are injected (docs/08 §8.3).
 */

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
	/** `listNamesVisibleTo`, for just these ids: the ones the viewer may not see are left out. */
	listNamesAmongVisibleTo(viewer: Viewer, ids: readonly string[]): Promise<ContactName[]>;
	/** Id and name of those of these ids the household still browses — archived ones left out. */
	listBrowsableNamesAmong(viewer: Viewer, ids: readonly string[]): Promise<ContactName[]>;
	/**
	 * Up to `limit` ids from the browsing scope, in no particular order — for a decision that
	 * only needs to know whether there is anybody (else), not who (Home's first-run card).
	 */
	listSomeBrowsableIdsVisibleTo(viewer: Viewer, limit: number): Promise<string[]>;
	/** How many `listArchivedVisibleTo` would list. */
	countArchivedVisibleTo(viewer: Viewer): Promise<number>;
	/** What tells each browsable person apart (docs/02 §2.2.3), without the rest of the record. */
	listDistinguishableVisibleTo(viewer: Viewer): Promise<DistinguishableContact[]>;
	/** Write the hero's own fields; the caller has already checked the contact is visible. */
	updateProfile(id: string, patch: ProfilePatch): Promise<void>;
	/** Record a gender, or none; the caller has already checked the contact is visible. */
	setGender(id: string, gender: Gender | null, updatedAt: number): Promise<void>;
	/** Write both job fields at once; the caller has already checked the contact is visible. */
	setJob(id: string, job: Job, updatedAt: number): Promise<void>;
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
	/** Both records as a merge needs them, or null when either is out of the viewer's reach. */
	readForMerge(viewer: Viewer, keepId: string, mergedId: string): Promise<MergePair | null>;
	/**
	 * Move everything from one record onto the other, write the merged profile, delete the
	 * emptied record and log it — all in one transaction. False when either is out of reach.
	 */
	mergeVisibleTo(
		viewer: Viewer,
		keepId: string,
		mergedId: string,
		profile: MergeableProfile,
		audit: NewActivityEntry,
		updatedAt: number
	): Promise<boolean>;
}

export interface ContactDeps {
	contacts: ContactRepository;
	ids: IdGenerator;
	clock: Clock;
}

/** The two records a merge is about, with the names the log will have to remember. */
export interface MergePair {
	keep: { displayName: string; visibility: Visibility; profile: MergeableProfile };
	mergedAway: { displayName: string; profile: MergeableProfile };
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
export class InvalidBirthDateError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.birthDateFormat'), 'InvalidBirthDateError');
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

/** Thrown when a gender is not one of the three Stella records (docs/02 §2.2). */
export class InvalidGenderError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.invalidGender'), 'InvalidGenderError');
	}
}

/** A gender as given, or none; anything but the three is refused rather than stored. */
function checkedGender(gender: Gender | null | undefined): Gender | null {
	if (gender === null || gender === undefined) return null;
	if (!isGender(gender)) throw new InvalidGenderError();
	return gender;
}

/**
 * Thrown when a person is being added by a first name alone: with no last name and no line to
 * know them by, they cannot be told from the next person of that name (docs/02 §2.2.3).
 */
export class NeedsSomethingToKnowThemByError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.needsSomethingToKnowThemBy'), 'NeedsSomethingToKnowThemByError');
	}
}

/**
 * Create a contact, deriving its display name and defaulting its visibility. Everyone added by
 * hand comes through here; imports write through their own adapters and keep what they carry.
 */
export async function createContact(
	deps: ContactDeps,
	creator: ContactCreator,
	input: CreateContactInput
): Promise<string> {
	const displayName = deriveDisplayName(input, creator.locale);
	if (!isKnownByMoreThanAFirstName(input)) throw new NeedsSomethingToKnowThemByError();
	const { birthDate, birthDatePrecision } = parseBirthDate(input.birthDate);
	const gender = checkedGender(input.gender);
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
		gender,
		createdAt: now,
		updatedAt: now
	};

	await deps.contacts.insert(contact);
	return id;
}

/** Thrown when an edit would leave a contact with no name at all; the edge shows it to whoever typed the blank. */
export class EmptyContactNameError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.emptyName'), 'EmptyContactNameError');
	}
}

/** What the hero's description edit sends (docs/02 §2.2); the name has its own editor. */
export interface ProfileEdit {
	description: string | null;
}

/**
 * Reword a contact's description, in place; the name is kept as stored — renaming goes through
 * `editNameParts`, so there is one way to do it. Returns false when the contact is not visible
 * to the viewer, so a route answers 404 the same way it does for a missing one — the visibility
 * check is the read, exactly as everywhere else (docs/03 §3.7).
 */
export async function editProfile(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	edit: ProfileEdit
): Promise<boolean> {
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	await deps.contacts.updateProfile(id, {
		displayName: contact.displayName,
		description: orNull(edit.description),
		updatedAt: deps.clock.now()
	});
	return true;
}

/**
 * Record a person's gender, or take it off the record with null (docs/02 §2.2). Returns false
 * when the contact is not visible to the viewer, like `editProfile`.
 */
export async function setGender(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	gender: Gender | null
): Promise<boolean> {
	const checked = checkedGender(gender);
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	await deps.contacts.setGender(id, checked, deps.clock.now());
	return true;
}

/** Thrown when a job title or company is longer than Stella keeps (docs/02 §2.2). */
export class JobFieldTooLongError extends TranslatableError {
	constructor() {
		super(
			phrase('errors.contact.jobFieldTooLong', { max: JOB_FIELD_MAX_LENGTH }),
			'JobFieldTooLongError'
		);
	}
}

/** One job field trimmed, a blank one as null; longer than Stella keeps is refused, not cut. */
function checkedJobField(value: string | null): string | null {
	const trimmed = orNull(value);
	if (trimmed !== null && trimmed.length > JOB_FIELD_MAX_LENGTH) throw new JobFieldTooLongError();
	return trimmed;
}

/**
 * Record what a person does and where, from the profile card's one editor (docs/02 §2.2): both
 * fields at once, each trimmed, an emptied one taken off the record. Returns false when the
 * contact is not visible to the viewer, like `editProfile`.
 */
export async function setJob(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	job: Job
): Promise<boolean> {
	const checked: Job = {
		jobTitle: checkedJobField(job.jobTitle),
		company: checkedJobField(job.company)
	};
	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	await deps.contacts.setJob(id, checked, deps.clock.now());
	return true;
}

export class EmptyDescriptionError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.emptyDescription'), 'EmptyDescriptionError');
	}
}

/**
 * Give someone a description and nothing else — the clean-up list's one field, for people
 * known by a first name only (docs/02 §2.2.3). Their name stays as it is. Returns false when
 * the contact is not visible to the viewer, like `editProfile`.
 */
export async function describeContact(
	deps: Pick<ContactDeps, 'contacts' | 'clock'>,
	viewer: Viewer,
	id: string,
	description: string
): Promise<boolean> {
	const written = description.trim();
	if (written.length === 0) throw new EmptyDescriptionError();

	const contact = await deps.contacts.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	await deps.contacts.updateProfile(id, {
		displayName: contact.displayName,
		description: written,
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

/**
 * `listContactNames` for just the people a page is about to name — the mentions in the story
 * page it renders, say — rather than everyone in the household.
 */
export async function listContactNamesAmong(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer,
	ids: readonly string[]
): Promise<ContactName[]> {
	const unique = [...new Set(ids)];
	return unique.length === 0 ? [] : deps.contacts.listNamesAmongVisibleTo(viewer, unique);
}

/** Those of `ids` the viewer may see and the household still browses, with their names. */
export async function listBrowsableNamesAmong(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer,
	ids: readonly string[]
): Promise<ContactName[]> {
	const unique = [...new Set(ids)];
	return unique.length === 0 ? [] : deps.contacts.listBrowsableNamesAmong(viewer, unique);
}

/**
 * How many browsable people are known by a first name alone (docs/02 §2.2.3) — the number on
 * the Settings card — counted by the clean-up list's own rule over just the columns it reads.
 */
export async function countKnownByAFirstNameOnly(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer
): Promise<number> {
	return (await deps.contacts.listDistinguishableVisibleTo(viewer)).filter(isKnownByAFirstNameOnly)
		.length;
}

/**
 * Enough of the household's browsable people to tell whether it holds anybody besides the
 * viewer's own record: two ids, so one more than the self record can ever be. Home's first-run
 * card (docs/02 §2.22.3) asks this on every visit, so it must not read the whole household.
 */
export async function listPeopleEnoughForFirstRun(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer
): Promise<string[]> {
	return deps.contacts.listSomeBrowsableIdsVisibleTo(viewer, 2);
}

/** How many archived people the viewer may see — what the archive chip says. */
export async function countArchivedContacts(
	deps: Pick<ContactDeps, 'contacts'>,
	viewer: Viewer
): Promise<number> {
	return deps.contacts.countArchivedVisibleTo(viewer);
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

/**
 * Merge one person into another: the survivor keeps their name and their visibility, gains
 * whatever the other record said that they did not (`mergeProfiles`), and takes over every
 * note, photo, date, link and journal entry. The emptied record is then deleted and the merge
 * written to the log — the only trace left of a name that used to exist (docs/02 §2.2).
 *
 * Returns false when either record is out of the viewer's reach, or when the two are the same.
 */
export async function mergeContacts(
	deps: Pick<ContactDeps, 'contacts' | 'ids' | 'clock'>,
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
		{
			id: deps.ids.next(),
			householdId: viewer.householdId,
			actorId: viewer.id,
			action: 'merge',
			entityType: 'contact',
			entityId: mergedId,
			// The survivor is what this is "about", and unlike a deletion they still have a page.
			contactId: keepId,
			visibility: pair.keep.visibility,
			summary: describeContactMerge(pair.mergedAway.displayName, pair.keep.displayName),
			createdAt: now
		},
		now
	);
}
