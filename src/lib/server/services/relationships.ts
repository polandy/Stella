import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzleGraphRepository, type GraphRepository } from '../db/graph-repository';
import { createDrizzleKinshipGraphReads } from '../db/kinship-graph-read';
import { createDrizzleRelationshipRepository } from '../db/relationship-repository';
import { createDrizzleRelationshipTieReads } from '../db/relationship-tie-reads';
import { createDrizzleRelationshipTypeRepository } from '../db/relationship-type-repository';
import { createDrizzleRelationshipTypeUsageReads } from '../db/relationship-type-usage-reads';
import type * as schema from '../db/schema';
import { createDrizzleSuggestionDismissalRepository } from '../db/suggestion-dismissal-repository';
import type { FamilyReadDeps } from '../domain/relationships/family';
import type {
	RelationshipTypeDeps,
	RelationshipTypeRepository,
	RelationshipTypeUsageReads
} from '../domain/relationships/relationship-types';
import type { RelationshipDeps } from '../domain/relationships/relationships';
import type {
	KinshipGraphReads,
	SuggestionReviewDeps
} from '../domain/relationships/suggestion-review';
import type { IdGenerator } from '../id';

/*
 * The `relationships` bounded context of the composition root (docs/08 §8.3): the links
 * between people and the vocabulary they are typed in, the suggestions the kinship graph
 * offers and the ones the household declined, the family cards of the person page and the
 * map. Built once per process by `createServices`; the edge reads it off
 * `locals.services.relationships`.
 *
 * A port an edge — or another context — reads directly sits under its own name
 * (`relationshipTypes`, `kinship`); everything else is a use-case's `deps`, named after its type
 * (`relationshipDeps` is a `RelationshipDeps`).
 */
export interface RelationshipServices {
	/** The relationship vocabulary (docs/02 §2.4): the person page's picker, the settings list. */
	relationshipTypes: RelationshipTypeRepository;
	/** How much each type is used, so the settings page offers *remove* only where it succeeds. */
	relationshipTypeUsage: RelationshipTypeUsageReads;
	/** The visible kinship graph: the people context's surname proposals follow it. */
	kinship: KinshipGraphReads;
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
	const relationships = createDrizzleRelationshipRepository(db);
	const types = createDrizzleRelationshipTypeRepository(db);
	const kinship = createDrizzleKinshipGraphReads(db);
	const ties = createDrizzleRelationshipTieReads(db);
	const graph = createDrizzleGraphRepository(db);
	const dismissals = createDrizzleSuggestionDismissalRepository(db);

	return {
		relationshipTypes: types,
		relationshipTypeUsage: createDrizzleRelationshipTypeUsageReads(db),
		kinship,
		graph,
		relationshipDeps: { relationships, kinship, ties, types, ids, clock },
		relationshipTypeDeps: { types, ids },
		suggestionReviewDeps: { kinship, dismissals, ids, clock },
		familyReadDeps: { family: graph, ties, dismissals }
	};
}
