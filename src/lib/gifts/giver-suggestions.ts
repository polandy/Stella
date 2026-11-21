import type { GraphModel } from '../graph/model/types';
import { PARENT_CHILD_TYPE_KEY } from '../relationships/type-keys';

/*
 * Whom *Wer schenkt?* suggests before any search (docs/dev/02 §2.25.12): the person's own links,
 * both ways and their children too, then the household — its members' own people and their
 * children. Pure, so the card and its tests read one order.
 */

/** Someone offered as a giver, with what they are to the person when that is known. */
export interface GiverSuggestion {
	id: string;
	name: string;
	hint: string | null;
}

/** The household's own givers in the visible graph: each member's own person, then their children. */
export function householdGivers(
	memberContactIds: readonly string[],
	graph: Pick<GraphModel, 'nodes' | 'edges'>
): GiverSuggestion[] {
	const living = new Map(
		graph.nodes
			.filter((node) => node.kind === 'person' && !node.deceased)
			.map((node) => [node.id, node.label])
	);
	const members = memberContactIds.filter((id) => living.has(id));
	const children = graph.edges
		.filter(
			(edge) =>
				edge.kind === 'relationship' &&
				edge.typeKey === PARENT_CHILD_TYPE_KEY &&
				members.includes(edge.source)
		)
		.map((edge) => edge.target);
	return [...new Set([...members, ...children])]
		.filter((id) => living.has(id))
		.map((id) => ({ id, name: living.get(id)!, hint: null }));
}

/** Which of `ids` are living people in the visible graph: the dead give no more gifts. */
export function livingAmong(ids: readonly string[], graph: Pick<GraphModel, 'nodes'>): string[] {
	const living = new Set(
		graph.nodes.filter((node) => node.kind === 'person' && !node.deceased).map((node) => node.id)
	);
	return [...new Set(ids)].filter((id) => living.has(id));
}

/** The person's links, then the household not already among them; never the person themselves. */
export function giverSuggestions(
	recipientId: string,
	ties: readonly GiverSuggestion[],
	household: readonly GiverSuggestion[]
): { ties: GiverSuggestion[]; household: GiverSuggestion[] } {
	const seen = new Set([recipientId]);
	const fresh = (list: readonly GiverSuggestion[]) =>
		list.filter((person) => !seen.has(person.id) && Boolean(seen.add(person.id)));
	return { ties: fresh(ties), household: fresh(household) };
}
