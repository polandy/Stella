import type { CardPhoto } from '$lib/people/photo-card';
import type { GlimpsePhoto } from '$lib/immich/strip';
import type { RelationshipCategory } from '$lib/relationships/categories';
import type { Exclusion } from '$lib/relationships/exclusions';
import type { RelationshipTypeOption } from '$lib/relationships/type-options';
import type { ActionData, PageData } from '../../../routes/(app)/contacts/[id]/$types';

/*
 * The person page's sections (docs/05 §5.5) are that one page cut at its seams, so they read
 * the page's own data and form result rather than restating every shape: what its `load` and
 * actions produce stays the single definition, and a section reading something `load` no
 * longer sends fails `bun run check` instead of rendering nothing.
 */

/** What the person page's `load` hands its sections. */
export type PersonPageData = PageData;

/** The result of the page's last form action, carrying each section's error. */
export type PersonForm = ActionData;

/** The relationship picker's entries: every type, read from each of its sides. */
export type RelationshipChoices = RelationshipTypeOption<
	PersonPageData['relationshipTypes'][number]
>[];

/** What the household's records rule out for one picker entry and target, or null. */
export type ExclusionOf = (
	option: { type: { key: string; category: RelationshipCategory }; side: 'forward' | 'reverse' },
	targetId: string | null | undefined,
	exceptId?: string | null
) => Exclusion | null;

/** A photo on the Photos card — a gallery photo or one from Immich — with where it lives. */
export type CardEntry = CardPhoto<PersonPageData['gallery'][number], GlimpsePhoto>;
