import { FORMER_RELATIONSHIP_STATUS } from '../relationships/status';
import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS, SIBLING_TYPE_KEY } from '../relationships/type-keys';
import type { KinPerson, KinshipGraph, Pair, ParentEdge, PartnerEdge } from './kinship';

/*
 * Stored links, as the kinship engine reads them (docs/02 §2.4.1). Pure, so the read that
 * feeds the person page and the explorer (`server/db/kinship-graph-read.ts`) and a batch of
 * links still being checked before it is written (`domain/relationships/add-many.ts`) build
 * the graph by the one rule.
 */

/** A visible link as the kinship engine reads it: its two ends, its type and whether it holds. */
export interface KinshipLinkRow {
	fromId: string;
	toId: string;
	key: string;
	status: string;
}

/**
 * The engine's input from rows already scoped to the viewer. Shared with the graph repository,
 * which reads the same people and links for the explorer and builds both from the one read,
 * and with a batch of new links checked against each other before any is stored.
 */
export function kinshipGraphOf(people: KinPerson[], rows: readonly KinshipLinkRow[]): KinshipGraph {
	const parentEdges: ParentEdge[] = [];
	const siblingEdges: Pair[] = [];
	const partnerEdges: PartnerEdge[] = [];
	const storedPairs: Pair[] = [];
	for (const row of rows) {
		// Every visible pair counts as stored, so an existing link is never re-derived.
		storedPairs.push({ a: row.fromId, b: row.toId });
		if (row.key === PARENT_CHILD_TYPE_KEY) parentEdges.push({ parentId: row.fromId, childId: row.toId });
		else if (row.key === SIBLING_TYPE_KEY) siblingEdges.push({ a: row.fromId, b: row.toId });
		else if (PARTNER_TYPE_KEYS.includes(row.key)) {
			// The link stays on record either way; `former` only stops the derivation.
			partnerEdges.push({
				a: row.fromId,
				b: row.toId,
				former: row.status === FORMER_RELATIONSHIP_STATUS
			});
		}
	}
	return { people, parentEdges, siblingEdges, partnerEdges, storedPairs };
}
