import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleGraphRepository, type GraphRepository } from '../db/graph-repository';
import { createDrizzleRelationshipRepository } from '../db/relationship-repository';
import type * as schema from '../db/schema';
import { createDrizzleSuggestionDismissalRepository } from '../db/suggestion-dismissal-repository';
import type { FamilyReadDeps } from '../domain/relationships/family';
import type {
	RelationshipTypeDeps,
	RelationshipTypeRepository
} from '../domain/relationships/relationship-types';
import type {
	RelationshipDeps,
	RelationshipRepository
} from '../domain/relationships/relationships';
import type { SuggestionReviewDeps } from '../domain/relationships/suggestion-review';
import type { IdGenerator } from '../id';

/*
 * The `relationships` bounded context of the composition root (docs/08 §8.3): the links
 * between people and the vocabulary they are typed in, the suggestions the kinship graph
 * offers and the ones the household declined, the family cards of the person page and the
 * map. Built once per process by `createServices`; the edge reads it off
 * `locals.services.relationships`.
 *
 * A repository an edge — or another context — reads directly sits under its plural noun
 * (`relationships`); everything else is a use-case's `deps`, named after its type
 * (`relationshipDeps` is a `RelationshipDeps`).
 */
export interface RelationshipServices {
	/** The one relationship repository: every use-case below, and the people context, read it. */
	relationships: RelationshipRepository;
	/** The relationship vocabulary (docs/02 §2.4) — the same Drizzle object as `relationships`. */
	relationshipTypes: RelationshipTypeRepository;
	/** The visible graph the map loads in one go and the family cards read (docs/04 §4.11). */
	graph: GraphRepository;
	relationshipDeps: RelationshipDeps;
	relationshipTypeDeps: RelationshipTypeDeps;
	/** The on-demand suggestion review and the dismissal log (docs/04 ADR-117). */
	suggestionReviewDeps: SuggestionReviewDeps;
	familyReadDeps: FamilyReadDeps;
}

export interface RelationshipWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
}

export function createRelationshipServices({
	db,
	clock,
	ids
}: RelationshipWiring): RelationshipServices {
	// One adapter serves both ports; each use-case sees only its own.
	const relationships = createDrizzleRelationshipRepository(db);
	const graph = createDrizzleGraphRepository(db);
	const dismissals = createDrizzleSuggestionDismissalRepository(db);

	return {
		relationships,
		relationshipTypes: relationships,
		graph,
		relationshipDeps: { relationships, types: relationships, ids, clock },
		relationshipTypeDeps: { types: relationships, ids },
		suggestionReviewDeps: { relationships, dismissals, ids, clock },
		familyReadDeps: { family: graph, relationships, dismissals }
	};
}
