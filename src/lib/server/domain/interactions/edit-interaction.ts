import { phrase } from '../../../i18n/phrase';
import type { Clock } from '../../clock';
import type { ContactNameReads } from '../contacts/contact-names';
import {
	checkedInteraction,
	InvalidInteractionError,
	orNull,
	type InteractionKind,
	type InteractionRepository
} from './interactions';

/*
 * Correcting a touchpoint (docs/02 §2.6, docs/03 §3.7): its author alone — an admin removes
 * another member's shared one but never rewrites it — for the day, the kind, the text and who
 * took part. Who sees it stays out of the editor, as with a journal entry. Not a command:
 * editing waits for a connection, like removing, so the right is checked when the edit lands.
 * Edits are not in the activity feed (docs/02 §2.11).
 */

export interface EditInteractionDeps {
	interactions: Pick<InteractionRepository, 'findOwn' | 'updateOwn'>;
	/** Who a newly named participant can be: the people the author sees and still browses. */
	contactNames: Pick<ContactNameReads, 'listBrowsableNamesAmong'>;
	clock: Clock;
}

export interface EditInteractionInput {
	id: string;
	kind: InteractionKind;
	happenedAt: string;
	title?: string | null;
	description?: string | null;
	participantIds: string[];
}

/**
 * Rewrite a touchpoint; whether it did. One that is gone and one the editor may not touch
 * answer alike, so a foreign id reveals nothing. A participant already on it may stay though
 * they have since been archived; one newly named must be someone the picker offers.
 */
export async function editInteraction(
	deps: EditInteractionDeps,
	author: { userId: string; householdId: string },
	input: EditInteractionInput
): Promise<boolean> {
	const viewer = { id: author.userId, householdId: author.householdId };
	const found = await deps.interactions.findOwn(viewer, input.id);
	if (!found) return false;

	const { happenedAt, participantIds } = checkedInteraction({
		...input,
		contactId: found.contactId
	});
	const named = participantIds.filter((id) => !found.participantIds.includes(id));
	const browsable =
		named.length === 0 ? [] : await deps.contactNames.listBrowsableNamesAmong(viewer, named);
	if (browsable.length !== named.length) {
		throw new InvalidInteractionError(phrase('errors.interaction.participantNotFound'));
	}

	return deps.interactions.updateOwn(viewer, {
		id: input.id,
		kind: input.kind,
		happenedAt,
		title: orNull(input.title),
		description: orNull(input.description),
		participantIds,
		updatedAt: deps.clock.now()
	});
}
