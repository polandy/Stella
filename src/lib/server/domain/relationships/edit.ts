import { phrase } from '../../../i18n/phrase';
import { relationshipPair } from '../../../relationships/endpoints';
import { endpointsForSide, type RelationshipSide } from '../../../relationships/type-options';
import { GENERATION_TYPE_KEYS } from '../../../relationships/type-keys';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { parseRelationshipDetails, type RelationshipDetailsInput } from './details';
import { guardExclusions, type ExclusionSource } from './exclusions';
import {
	InvalidRelationshipTypeError,
	type RelationshipTypeRepository
} from './relationship-types';
import {
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	type RelationshipRepository,
	type Retype,
	type StoredRelationship
} from './relationships';

/*
 * Correcting a link that is already there (docs/02 §2.4): its specifics, and its type. A
 * retype can move the stored direction, so it passes the same guards creating a link does.
 */

/** What an edit reads and writes: the link itself, and what a retype is judged against. */
export interface EditRelationshipDeps extends ExclusionSource {
	relationships: Pick<RelationshipRepository, 'exists' | 'findVisibleTo' | 'updateVisibleTo'>;
	types: Pick<RelationshipTypeRepository, 'getType'>;
	clock: Clock;
}

/** One edit of a link that is already there: its specifics, and optionally its type. */
export interface EditRelationshipInput extends RelationshipDetailsInput {
	relationshipId: string;
	/** Whose profile the edit was made from — the chosen side is read from their perspective. */
	perspectiveContactId: string;
	/** The type and the side it was read from; absent leaves the type alone. */
	typeChoice?: { typeId: string; side: RelationshipSide } | null;
}

/** The endpoint of `link` that is not `contactId`, or null when they are not an endpoint. */
function otherEndpointOf(link: StoredRelationship, contactId: string): string | null {
	if (contactId === link.fromContactId) return link.toContactId;
	if (contactId === link.toContactId) return link.fromContactId;
	return null;
}

/**
 * Where a link lands once it carries another type (docs/02 §2.4): the chosen side is read
 * from the profile the edit was made on, and the type decides whether the pair is stored
 * order-independently — so a partner becoming a spouse, and a generation entered the wrong
 * way round, both come out canonical. Null when the viewer is editing from a profile that is
 * not an endpoint of the link.
 *
 * The guards are the ones creating a link passes, with the link itself left out of both:
 * measured against itself, every retype would read as its own duplicate and every flipped
 * generation as its own contradiction.
 */
async function planRetype(
	deps: EditRelationshipDeps,
	viewer: Viewer,
	current: StoredRelationship,
	perspectiveContactId: string,
	choice: { typeId: string; side: RelationshipSide }
): Promise<Retype | null> {
	const type = await deps.types.getType(viewer, choice.typeId);
	if (!type) throw new InvalidRelationshipTypeError(phrase('errors.relationshipType.gone'));

	const otherContactId = otherEndpointOf(current, perspectiveContactId);
	if (otherContactId === null) return null;

	const asked = endpointsForSide(perspectiveContactId, otherContactId, choice.side);
	const endpoints = relationshipPair(asked.fromContactId, asked.toContactId, type.symmetric);

	if (
		await deps.relationships.exists(
			endpoints.fromContactId,
			endpoints.toContactId,
			type.id,
			current.id
		)
	) {
		throw new DuplicateRelationshipError();
	}
	if (
		GENERATION_TYPE_KEYS.includes(type.key) &&
		(await deps.relationships.exists(
			endpoints.toContactId,
			endpoints.fromContactId,
			type.id,
			current.id
		))
	) {
		throw new ContradictoryRelationshipError();
	}

	await guardExclusions(deps, viewer, endpoints, type, perspectiveContactId, current.id);

	return { endpoints, typeId: type.id };
}

/**
 * Correct a link that is already there (docs/02 §2.4): its specifics, and its type where a
 * tie was named wrongly or has moved on — a partner who became a spouse. Changing the type
 * can flip the stored direction, so the same duplicate and contradiction guards that creating
 * a link passes are re-run here.
 *
 * Returns false when the viewer may not see the relationship — the same answer as for one
 * that does not exist, so no one learns of a link through a private person by editing it.
 */
export async function editRelationship(
	deps: EditRelationshipDeps,
	viewer: Viewer,
	input: EditRelationshipInput
): Promise<boolean> {
	const details = parseRelationshipDetails(input);

	let retype: Retype | null = null;
	if (input.typeChoice) {
		const current = await deps.relationships.findVisibleTo(viewer, input.relationshipId);
		if (!current) return false;
		retype = await planRetype(deps, viewer, current, input.perspectiveContactId, input.typeChoice);
		if (!retype) return false;
	}

	return deps.relationships.updateVisibleTo(
		viewer,
		input.relationshipId,
		{ ...details, retype },
		deps.clock.now()
	);
}
