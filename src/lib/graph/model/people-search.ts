import type { GraphModel } from './types';

/*
 * Finding somebody on the explorer route (docs/05 §5.8): the field suggests people from the
 * snapshot the route already holds, so typing asks nothing of the server.
 */

/** A person the find field can suggest. */
export interface FindablePerson {
	id: string;
	displayName: string;
}

/** The most suggestions shown under the field at once. */
export const SUGGESTION_LIMIT = 6;

/** The people in `graph` (circles are reached through them), by name. */
export function peopleOf(graph: GraphModel): FindablePerson[] {
	return graph.nodes
		.filter((n) => n.kind === 'person')
		.map((n) => ({ id: n.id, displayName: n.label }))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Those whose name holds what was typed, whatever its case; nobody for an empty field. */
export function matchPeople(people: readonly FindablePerson[], query: string): FindablePerson[] {
	return query.trim()
		? people
				.filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()))
				.slice(0, SUGGESTION_LIMIT)
		: [];
}
