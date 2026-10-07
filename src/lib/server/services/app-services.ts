import { createAuthServices, type AuthServices, type AuthWiring } from './auth';

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
}

/** What the graph is built from; each context's wiring joins this as it moves in. */
export type ServicesWiring = AuthWiring;

/** Wires every grouped context. Pure assembly: no I/O beyond what the adapters do when used. */
export function createServices(wiring: ServicesWiring): AppServices {
	return { auth: createAuthServices(wiring) };
}
