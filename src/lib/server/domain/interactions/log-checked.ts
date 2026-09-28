import { phrase } from '../../../i18n/phrase';
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
 * kept on a phone (`interaction.log`, docs/concepts/offline-capture.md §4.1) is judged exactly
 * like one logged online.
 */

export interface LogCheckedDeps extends InteractionDeps {
	contacts: Pick<ContactRepository, 'findByIdVisibleTo' | 'listVisibleTo'>;
}

/** Log a touchpoint on a person the author can see, with participants they can see. */
export async function logInteractionChecked(
	deps: LogCheckedDeps,
	author: { userId: string; householdId: string },
	input: Required<Omit<LogInteractionInput, 'visibility'>> & Pick<LogInteractionInput, 'visibility'>
): Promise<{ interactionId: string }> {
	await requireVisibleContact(deps.contacts, author, input.contactId);
	const viewer = { id: author.userId, householdId: author.householdId };
	const visible = new Set((await deps.contacts.listVisibleTo(viewer)).map((c) => c.id));
	if (!input.participantIds.every((id) => visible.has(id))) {
		throw new InvalidInteractionError(phrase('errors.interaction.participantNotFound'));
	}
	const interactionId = await logInteraction(
		deps,
		{ ...author, defaultVisibility: input.visibility ?? 'shared' },
		input
	);
	return { interactionId };
}
