import type { Visibility, Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
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
	/** Write the hero's own fields; the caller has already checked the contact is visible. */
	updateProfile(id: string, patch: ProfilePatch): Promise<void>;
}

export interface ContactDeps {
	contacts: ContactRepository;
	ids: IdGenerator;
	clock: Clock;
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

/** Thrown when an edit would leave a contact with no name at all. */
export class EmptyContactNameError extends Error {
	constructor() {
		super('A name cannot be empty.');
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
