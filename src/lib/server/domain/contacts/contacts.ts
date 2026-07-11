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
	createdAt: number;
	updatedAt: number;
}

/** Full contact as read back for a profile. */
export interface Contact extends NewContact {
	avatarPhotoId: string | null;
}

/** Row shape for list views. */
export interface ContactSummary {
	id: string;
	displayName: string;
	description: string | null;
	visibility: Visibility;
	avatarPhotoId: string | null;
}

export interface ContactRepository {
	insert(contact: NewContact): Promise<void>;
	findByIdVisibleTo(viewer: Viewer, id: string): Promise<Contact | null>;
	listVisibleTo(viewer: Viewer): Promise<ContactSummary[]>;
}

export interface ContactDeps {
	contacts: ContactRepository;
	ids: IdGenerator;
	clock: Clock;
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
		createdAt: now,
		updatedAt: now
	};

	await deps.contacts.insert(contact);
	return id;
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
