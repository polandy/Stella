/*
 * The two ends of a relationship row. Shared vocabulary: the domain stores them, and the
 * picker decides which way round they go (`type-options.ts`), so the shape has one home.
 */

/** A relationship as stored: `from` is the side the type's forward label reads from. */
export interface Endpoints {
	fromContactId: string;
	toContactId: string;
}

declare const canonical: unique symbol;

/** Endpoints in their canonical storage order; only `relationshipPair` makes one. */
export type RelationshipPair = Endpoints & { readonly [canonical]: true };

/**
 * The canonical storage direction (docs/03 §3.3 relationship). A symmetric link is stored with
 * its ends sorted, so the unique index catches a duplicate whichever end it was entered from; a
 * one-way link keeps the given order (from = forward-label side). A self link is refused.
 */
export function relationshipPair(
	fromId: string,
	toId: string,
	symmetric: boolean
): RelationshipPair {
	if (fromId === toId) {
		throw new Error('A contact cannot have a relationship with themselves.');
	}
	const [fromContactId, toContactId] = symmetric && toId < fromId ? [toId, fromId] : [fromId, toId];
	return { fromContactId, toContactId } as RelationshipPair;
}
