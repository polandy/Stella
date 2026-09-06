/*
 * Whether a relationship still holds (docs/02 §2.4, docs/03 §relationship). Free text would
 * make "ex", "former" and "past" three different things and nothing could group them, so the
 * model knows exactly two — and "not said" stays a real answer, stored as null.
 *
 * It lives beside the type keys rather than in the domain because the person page offers the
 * choice, and a component cannot import from `$lib/server`.
 */

export const RELATIONSHIP_STATUSES = ['current', 'former'] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];
