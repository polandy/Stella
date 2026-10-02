import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { NewActivityEntry } from '../activity/activity';
import type { Contact } from './contacts';
import { withNameParts, type StoredName } from './display-name';

/*
 * Changing the parts of a person's name after they were added (docs/concepts/surnames.md §3.4,
 * §6, §7). Every path goes through `withNameParts`, so the shown name follows its parts the
 * same way wherever they change.
 */

/** One person's name as it is written back, with the moment it changed. */
export interface NameWrite extends StoredName {
	id: string;
	formerName: string | null;
	updatedAt: number;
}

/** The port the name use-cases write through (docs/08 §8.3). */
export interface NameRepository {
	findByIdVisibleTo(viewer: Viewer, id: string): Promise<Contact | null>;
	/**
	 * Write every name of `writes` and, when given, the log entry, in **one** transaction — a
	 * batch lands whole or not at all. The caller has already checked that each is visible.
	 */
	writeNames(writes: readonly NameWrite[], audit: NewActivityEntry | null): Promise<void>;
}

export interface NameDeps {
	names: NameRepository;
	clock: Clock;
}

/** What the profile's *Name parts* fields send (§3.4). */
export interface NamePartsEdit {
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	/** Keep the last name being replaced as the former name (§6). */
	keepFormerName: boolean;
}

/**
 * Write first name, last name and nickname from the profile. Emptying every part is allowed —
 * the shown name then stays as it is, so nobody ends up without a name. Returns false when the
 * person is not visible to the viewer, so the route answers 404 as for a missing one.
 */
export async function editNameParts(
	deps: NameDeps,
	viewer: Viewer,
	id: string,
	edit: NamePartsEdit
): Promise<boolean> {
	const contact = await deps.names.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	const next = withNameParts(contact, edit);
	const replacedLastName = contact.lastName !== null && contact.lastName !== next.lastName;
	const formerName = edit.keepFormerName && replacedLastName ? contact.lastName : contact.formerName;

	await deps.names.writeNames([{ id, ...next, formerName, updatedAt: deps.clock.now() }], null);
	return true;
}
