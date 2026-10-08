/*
 * Shared test support for the SvelteKit edge (docs/08 §8.5): a fake request event over a
 * test-wired `locals.services`, and one reading of what a load or an action answered. Apart from
 * `domain/testing/` because it speaks SvelteKit, which the domain may not. Imported by
 * `*.test.ts` files only — the guard in `domain/testing/testing.test.ts` holds that — so nothing
 * here reaches the build.
 */

export {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices,
	type RouteEventInit
} from './route-event';
