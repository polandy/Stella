import type { Locale } from '../../../i18n/locales';
import type { ContactAddPayload } from '../../../commands/commands';
import { setSelfContact, type SelfContactStore } from '../household/self-contact';
import { createContact, type ContactDeps } from './contacts';

/*
 * The `contact.add` command's use-case (docs/02 §2.2): add a person, and — when the member
 * said this person is them — record that too (§2.1.3). One step, so the first-run card's
 * "Start with yourself" leaves nothing to finish in Settings, and a phone that queued it
 * while out of reach gets the same result as a form posted online.
 */

export interface AddPersonDeps extends ContactDeps {
	accounts: SelfContactStore;
}

/** Who is adding the person. */
export interface PersonAdder {
	userId: string;
	householdId: string;
	/** Their language: a nickname in the shown name takes its quote marks (docs/02 §2.2). */
	locale: Locale;
}

export async function addPerson(
	deps: AddPersonDeps,
	adder: PersonAdder,
	payload: ContactAddPayload
): Promise<{ contactId: string }> {
	const { isSelf, ...person } = payload;
	const contactId = await createContact(
		deps,
		{ ...adder, defaultVisibility: person.visibility },
		person
	);
	if (isSelf) {
		// Through the same use-case as the Settings picker, so the rule that a member can only
		// be a record they can see holds here too.
		await setSelfContact(deps, { id: adder.userId, householdId: adder.householdId }, contactId);
	}
	return { contactId };
}
