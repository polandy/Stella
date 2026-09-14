import type { Endpoints } from './endpoints';

/*
 * Picking a relationship *direction*, not just a type (docs/02 §2.4). A row is stored one
 * way round — from = the forward-label side — but somebody adding a link says it from the
 * person they are looking at: "Anna is a child of Bert" just as often as "Bert is a parent
 * of Anna". So an asymmetric type is offered from both sides and the chosen side decides
 * which endpoint is stored as `from`; a symmetric type reads the same either way and is
 * offered once.
 */

/** The two labels a type carries, in the order the picker offers them. */
export const RELATIONSHIP_SIDES = ['forward', 'reverse'] as const;

/** Which of a type's two labels a choice reads. */
export type RelationshipSide = (typeof RELATIONSHIP_SIDES)[number];

/** Separates the side from the type id in a posted choice; the side never contains it. */
const CHOICE_SEPARATOR = ':';

const isRelationshipSide = (value: string): value is RelationshipSide =>
	RELATIONSHIP_SIDES.some((side) => side === value);

/** What a type needs to carry to be offered in the picker. */
export interface SelectableType {
	id: string;
	symmetric: boolean;
}

/** One entry of the relationship picker: a type read from one of its sides. */
export interface RelationshipTypeOption<T extends SelectableType> {
	type: T;
	side: RelationshipSide;
	/** The form value that carries both, see `decodeRelationshipChoice`. */
	value: string;
}

/** The form value for one side of a type. */
export function encodeRelationshipChoice(typeId: string, side: RelationshipSide): string {
	return `${side}${CHOICE_SEPARATOR}${typeId}`;
}

/** The type and side a posted choice names, or null when it is not one Stella wrote. */
export function decodeRelationshipChoice(
	value: string
): { typeId: string; side: RelationshipSide } | null {
	const separator = value.indexOf(CHOICE_SEPARATOR);
	if (separator < 0) return null;

	const side = value.slice(0, separator);
	const typeId = value.slice(separator + CHOICE_SEPARATOR.length);
	if (typeId.length === 0) return null;
	if (!isRelationshipSide(side)) return null;

	return { typeId, side };
}

/**
 * The picker's entries, in the order the types arrive: an asymmetric type twice (forward
 * then reverse), a symmetric one once.
 */
export function relationshipTypeOptions<T extends SelectableType>(
	types: readonly T[]
): RelationshipTypeOption<T>[] {
	return types.flatMap((type) => {
		const forward: RelationshipTypeOption<T> = {
			type,
			side: 'forward',
			value: encodeRelationshipChoice(type.id, 'forward')
		};
		if (type.symmetric) return [forward];
		return [forward, { type, side: 'reverse', value: encodeRelationshipChoice(type.id, 'reverse') }];
	});
}

/**
 * Whether a picker entry is the one a stored link already reads as — what the edit form
 * preselects. A symmetric type is offered **once**, from its forward side, while a link
 * carrying it reads as `reverse` on the endpoint it is stored second: matching the side
 * literally would preselect nothing there, and a select with no match falls back to its
 * first entry, so saving the specifics alone would quietly retype the link.
 */
export function isChoiceOfLink<T extends SelectableType>(
	option: RelationshipTypeOption<T>,
	link: { typeId: string; side: RelationshipSide }
): boolean {
	if (option.type.id !== link.typeId) return false;
	return option.type.symmetric || option.side === link.side;
}

/**
 * The endpoints to store for a link entered from `selfId`'s profile. The reverse side means
 * the sentence was read the other way round ("self is a child of other"), so the other
 * person becomes the from-endpoint and the stored row still reads forward.
 */
export function endpointsForSide(
	selfId: string,
	targetId: string,
	side: RelationshipSide
): Endpoints {
	return side === 'reverse'
		? { fromContactId: targetId, toContactId: selfId }
		: { fromContactId: selfId, toContactId: targetId };
}
