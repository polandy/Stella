import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { decodeRelationshipChoice, endpointsForSide } from '../../../relationships/type-options';
import type { ContactRepository } from '../contacts/contacts';
import { requireVisibleContact } from '../contacts/require-visible';
import { createRelationship, type CreateRelationshipDeps } from './relationships';

/*
 * Linking two people from one of their pages (docs/02 §2.4), with the checks that used to live
 * in the person page's action: both people must be visible, the chosen type and side must be
 * one Stella offers, and `createRelationship` then applies every guardrail. One use-case, so a
 * link kept on a phone (`relationship.add`, docs/02 §2.18.1) is refused
 * for the same reasons — each one a sentence, never an error the phone would retry for ever.
 */

/** The type named is not one Stella knows (any more) — a custom type deleted meanwhile, say. */
export class UnknownRelationshipTypeError extends TranslatableError {
	constructor() {
		super(phrase('errors.relationship.needPersonAndType'), 'UnknownRelationshipTypeError');
	}
}

export interface AddCheckedDeps extends CreateRelationshipDeps {
	contacts: Pick<ContactRepository, 'findByIdVisibleTo'>;
}

export interface AddRelationshipInput {
	/** Whose page it was entered on. */
	contactId: string;
	targetId: string;
	/** Type *and* side, as `encodeRelationshipChoice` wrote them. */
	typeChoice: string;
	description: string | null;
	sinceDate: string | null;
	status: string | null;
}

/** Store a link between two people the author can see; returns its id. */
export async function addRelationshipChecked(
	deps: AddCheckedDeps,
	author: { userId: string; householdId: string },
	input: AddRelationshipInput
): Promise<{ relationshipId: string }> {
	const choice = decodeRelationshipChoice(input.typeChoice);
	if (!choice) throw new UnknownRelationshipTypeError();
	await requireVisibleContact(deps.contacts, author, input.contactId);
	await requireVisibleContact(deps.contacts, author, input.targetId);

	const viewer = { id: author.userId, householdId: author.householdId };
	if (!(await deps.types.getType(viewer, choice.typeId))) throw new UnknownRelationshipTypeError();

	const relationshipId = await createRelationship(deps, viewer, {
		...endpointsForSide(input.contactId, input.targetId, choice.side),
		typeId: choice.typeId,
		// A refusal describes the blocking link from the page it was entered on.
		perspectiveContactId: input.contactId,
		description: input.description,
		sinceDate: input.sinceDate,
		status: input.status
	});
	return { relationshipId };
}
