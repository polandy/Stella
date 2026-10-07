import { createAuthServices, type AuthServices, type AuthWiring } from './auth';
import { createCircleServices, type CircleServices, type CircleWiring } from './circles';
import { createMediaServices, type MediaServices, type MediaWiring } from './media';
import { createPeopleServices, type PeopleServices, type PeopleWiring } from './people';
import {
	createRelationshipServices,
	type RelationshipServices,
	type RelationshipWiring
} from './relationships';

/*
 * The application's object graph, grouped by bounded context (docs/04 §4.3, docs/08 §8.3).
 * `hooks.server.ts` hands it to every request as `locals.services`; a route reads
 * `locals.services.auth.sessionDeps` instead of importing a factory.
 *
 * It is being built one context per change (docs/concepts/architecture-review-2026-10.md,
 * AR-01): the contexts not grouped here yet are still wired by the `get*()` factories in
 * `./index.ts`.
 */
export interface AppServices {
	auth: AuthServices;
	people: PeopleServices;
	relationships: RelationshipServices;
	circles: CircleServices;
	media: MediaServices;
}

/**
 * What the graph is built from; each context's wiring joins this as it moves in. A context
 * that reads another grouped context's repository gets it from here, not from the wiring
 * (`people` reads `auth`'s accounts, the relationships context's repository and `media`'s
 * store, `circles` reads `people`'s contacts and `media`'s store), so each repository exists
 * once.
 */
export type ServicesWiring = AuthWiring &
	RelationshipWiring &
	MediaWiring &
	Omit<PeopleWiring, 'accounts' | 'relationships' | 'media'> &
	Omit<CircleWiring, 'contacts' | 'media'>;

/** Wires every grouped context. Pure assembly: no I/O beyond what the adapters do when used. */
export function createServices(wiring: ServicesWiring): AppServices {
	const auth = createAuthServices(wiring);
	const relationships = createRelationshipServices(wiring);
	const media = createMediaServices(wiring);
	const people = createPeopleServices({
		...wiring,
		accounts: auth.accounts,
		relationships: relationships.relationships,
		media: media.store
	});
	const circles = createCircleServices({
		...wiring,
		contacts: people.contacts,
		media: media.store
	});
	return { auth, people, relationships, circles, media };
}
