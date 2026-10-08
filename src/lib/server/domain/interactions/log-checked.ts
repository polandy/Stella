import { phrase } from '../../../i18n/phrase';
import type { ContactNameReads } from '../contacts/contact-names';
import type { ContactRepository } from '../contacts/contacts';
import { requireVisibleContact } from '../contacts/require-visible';
import {
	InvalidInteractionError,
	logInteraction,
	type InteractionDeps,
	type LogInteractionInput
} from './interactions';

/*
 * Logging a call or visit (docs/02 §2.6), with the checks that used to live in the person
 * page's action: the person must be one the author can see, and so must everyone named as
 * taking part — an unknown id is refused rather than stored. One use-case, so a touchpoint
 * kept on a phone (`interaction.log`, docs/02 §2.18.1) is judged exactly
 * like one logged online.
 */

export interface LogCheckedDeps extends InteractionDeps {
	contacts: Pick<ContactRepository, 'findByIdVisibleTo'>;
	/** Who a participant can be: the people the author sees and the household still browses. */
	contactNames: Pick<ContactNameReads, 'listBrowsableNamesAmong'>;
}

/** Log a touchpoint on a person the author can see, with participants they can see. */
export async function logInteractionChecked(
	deps: LogCheckedDeps,
	author: { userId: string; householdId: string },
	input: Required<Omit<LogInteractionInput, 'visibility'>> & Pick<LogInteractionInput, 'visibility'>
): Promise<{ interactionId: string }> {
	await requireVisibleContact(deps.contacts, author, input.contactId);
	const viewer = { id: author.userId, householdId: author.householdId };
	// Only the people named are looked up, in the same browsing scope the picker offers.
	const named = [...new Set(input.participantIds)];
	const found =
		named.length === 0 ? [] : await deps.contactNames.listBrowsableNamesAmong(viewer, named);
	if (found.length !== named.length) {
		throw new InvalidInteractionError(phrase('errors.interaction.participantNotFound'));
	}
	const interactionId = await logInteraction(
		deps,
		{ ...author, defaultVisibility: input.visibility ?? 'shared' },
		input
	);
	return { interactionId };
}
