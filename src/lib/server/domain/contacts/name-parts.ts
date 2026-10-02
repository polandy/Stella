import type { Viewer } from '../../access/visibility';
import type { Locale } from '../../../i18n/locales';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import { renameFacts, RENAME_ENTITY } from '../../../stream/notices';
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
	/** For the stream line a rename writes (docs/02 §2.11). */
	ids: IdGenerator;
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

	const now = deps.clock.now();
	const changed = (['displayName', 'firstName', 'lastName', 'nickname'] as const).some(
		(key) => (contact[key] ?? null) !== (next[key] ?? null)
	);
	// One line on Home per save that changes the name, no more visible than the person is.
	const audit: NewActivityEntry | null = changed
		? {
				id: deps.ids.next(),
				householdId: viewer.householdId,
				actorId: viewer.id,
				action: 'update',
				entityType: RENAME_ENTITY,
				entityId: id,
				contactId: id,
				visibility: contact.visibility,
				summary: renameFacts(contact.displayName, next.displayName),
				createdAt: now
			}
		: null;
	await deps.names.writeNames([{ id, ...next, formerName, updatedAt: now }], audit);
	return true;
}
