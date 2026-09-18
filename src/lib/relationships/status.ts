/*
 * Whether a relationship still holds (docs/02 §2.4, docs/03 §relationship). Free text would
 * make "ex", "former" and "past" three different things and nothing could group them, so the
 * model knows exactly two — and no third, unset state: a link that exists is current until
 * someone ends it, so "not said" would be a question no one can answer.
 *
 * It lives beside the type keys rather than in the domain because the person page offers the
 * choice, and a component cannot import from `$lib/server`.
 */

export const RELATIONSHIP_STATUSES = ['current', 'former'] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

/** The status that stops a link from being reasoned over — kinship derives nothing through it. */
export const FORMER_RELATIONSHIP_STATUS: RelationshipStatus = 'former';

/** What a link is worth as soon as it exists, and what an unanswered status form means. */
export const CURRENT_RELATIONSHIP_STATUS: RelationshipStatus = 'current';
