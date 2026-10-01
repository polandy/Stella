import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { ContactRepository } from './contacts';

/*
 * The check every addition on a person starts with (docs/03 §3.7): the person must be one the
 * author can see. Online the page could not have been opened otherwise; a command kept on a
 * phone may arrive after the person was deleted, merged away or made private, and is refused
 * with a reason the member can read (docs/concepts/offline-capture.md §4.4).
 */

/** The person something is being added to is not one the author can see (any more). */
export class ContactGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.contact.notFound'), 'ContactGoneError');
	}
}

/** Resolve when `contactId` is visible to the author; refuse with `ContactGoneError` otherwise. */
export async function requireVisibleContact(
	contacts: Pick<ContactRepository, 'findByIdVisibleTo'>,
	author: { userId: string; householdId: string },
	contactId: string
): Promise<void> {
	const viewer = { id: author.userId, householdId: author.householdId };
	if (!(await contacts.findByIdVisibleTo(viewer, contactId))) throw new ContactGoneError();
}

/**
 * `apply`, guarded: it runs only when the payload's person is visible to the author. For the
 * additions whose use-case predates commands and takes the check on trust from its caller.
 */
export function onVisibleContact<A extends { userId: string; householdId: string }, P extends { contactId: string }, R>(
	contacts: Pick<ContactRepository, 'findByIdVisibleTo'>,
	apply: (author: A, payload: P) => Promise<R>
): (author: A, payload: P) => Promise<R> {
	return async (author, payload) => {
		await requireVisibleContact(contacts, author, payload.contactId);
		return apply(author, payload);
	};
}
