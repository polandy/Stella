import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';

/*
 * "Which of these people am I?" (docs/02 §2.1.3). Every household member may point their
 * account at one contact — the record that is them. Stella then knows whose story the graph
 * opens on and which row to mark as you.
 *
 * The link is per member, not per household: two people sharing a Stella are two different
 * contacts.
 */

/** Port: just enough of the contact store to prove the chosen record is one the member may see. */
export interface SelfContactLookup {
	findByIdVisibleTo(viewer: Viewer, id: string): Promise<{ id: string } | null>;
}

/** Port: the account field that holds the link. */
export interface SelfContactStore {
	/** Point the member at that contact, or clear the link with `null`. */
	updateSelfContact(userId: string, contactId: string | null): Promise<void>;
}

export interface SelfContactDeps {
	contacts: SelfContactLookup;
	accounts: SelfContactStore;
}

/** Thrown when the chosen contact does not exist, or is not one this member may see. */
export class UnknownSelfContactError extends TranslatableError {
	constructor(readonly contactId: string) {
		super(phrase('errors.self.notFound'), 'UnknownSelfContactError');
	}
}

/**
 * Record which contact a member is, or clear the link when `contactId` is null or blank.
 *
 * A contact the viewer cannot see is refused rather than stored: it would be a link they
 * could never verify or undo from the interface, and on a shared household it would leak the
 * existence of another member's private record.
 */
export async function setSelfContact(
	deps: SelfContactDeps,
	viewer: Viewer,
	contactId: string | null
): Promise<string | null> {
	const wanted = contactId?.trim() ?? '';
	if (wanted === '') {
		await deps.accounts.updateSelfContact(viewer.id, null);
		return null;
	}

	const contact = await deps.contacts.findByIdVisibleTo(viewer, wanted);
	if (!contact) throw new UnknownSelfContactError(wanted);

	await deps.accounts.updateSelfContact(viewer.id, contact.id);
	return contact.id;
}
