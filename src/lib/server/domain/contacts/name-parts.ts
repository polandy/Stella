import type { Viewer } from '../../access/visibility';
import type { Locale } from '../../../i18n/locales';
import type { Clock } from '../../clock';
import type { NewActivityEntry } from '../activity/activity';
import { withNameEdit, type StoredName } from '../../../people/display-name';
import { EmptyContactNameError, type Contact } from './contacts';

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

/** What the profile's name editor sends (§3.4): the three parts and *Shown as*. */
export interface NamePartsEdit {
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	/** *Shown as*; blank means follow the parts. */
	displayName: string;
	/** Keep the last name being replaced as the former name (§6). */
	keepFormerName: boolean;
}

/**
 * Write the whole name from the profile's one editor — the only way to rename someone by hand.
 * Emptying every part is allowed while a shown name stands; with no parts and no shown name the
 * edit is refused (`EmptyContactNameError`), since nobody may end up without a name. Returns
 * false when the person is not visible to the viewer, so the route answers 404 as for a
 * missing one.
 */
export async function editNameParts(
	deps: NameDeps,
	viewer: Viewer,
	id: string,
	edit: NamePartsEdit,
	/** The editor's language: a nickname in the shown name takes its quote marks (docs/02 §2.2). */
	locale: Locale
): Promise<boolean> {
	const contact = await deps.names.findByIdVisibleTo(viewer, id);
	if (contact === null) return false;

	const next = withNameEdit(contact, edit, edit.displayName, locale);
	if (next === null) throw new EmptyContactNameError();
	const replacedLastName = contact.lastName !== null && contact.lastName !== next.lastName;
	const formerName = edit.keepFormerName && replacedLastName ? contact.lastName : contact.formerName;

	await deps.names.writeNames([{ id, ...next, formerName, updatedAt: deps.clock.now() }], null);
	return true;
}
