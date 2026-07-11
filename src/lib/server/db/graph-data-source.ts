import { and, eq, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import type { GraphDataSource, GraphEdge, GraphNode, Neighborhood } from '../../graph/model/types';
import { contactVisibleTo, relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for the GraphDataSource port (docs/04 §4.11). It answers "give me the
 * visible neighbourhood of node X" for the pure explorer builders — bound to one viewer so
 * the composition root creates a per-request source. Access scoping matches the rest of the
 * app: the centre must be a visible contact, and an edge appears only when *both* endpoints
 * are visible (docs/03 §3.7). Circle-membership and derived-kinship edges are added here in
 * M2 as extra queries merged into the same neighbourhood — no change to the pure model.
 */

const toPerson = (id: string, label: string, isDeceased: number): GraphNode => ({
	id,
	kind: 'person',
	label,
	deceased: isDeceased === 1
});

export function createDrizzleGraphDataSource(
	db: BunSQLiteDatabase<typeof schema>,
	viewer: Viewer
): GraphDataSource {
	return {
		async neighborhood(nodeId: string): Promise<Neighborhood | null> {
			const centerRow = db
				.select({ id: contact.id, name: contact.displayName, deceased: contact.isDeceased })
				.from(contact)
				.where(and(eq(contact.id, nodeId), contactVisibleTo(viewer)))
				.get();
			if (!centerRow) return null;

			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const rows = db
				.select({
					id: relationship.id,
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					fromName: fromC.displayName,
					toName: toC.displayName,
					fromDeceased: fromC.isDeceased,
					toDeceased: toC.isDeceased,
					category: relationshipType.category,
					forwardLabel: relationshipType.forwardLabel,
					symmetric: relationshipType.symmetric
				})
				.from(relationship)
				.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(
					and(
						or(eq(relationship.fromContactId, nodeId), eq(relationship.toContactId, nodeId)),
						relationshipVisibleTo(viewer, fromC, toC)
					)
				)
				.all();

			const neighbors = new Map<string, GraphNode>();
			const edges: GraphEdge[] = rows.map((r) => {
				// Neighbour = the endpoint that isn't the queried node; the edge keeps its stored
				// canonical orientation (from → to) so `forwardLabel` reads "source is … target".
				if (r.fromContactId === nodeId) {
					neighbors.set(r.toContactId, toPerson(r.toContactId, r.toName, r.toDeceased));
				} else {
					neighbors.set(r.fromContactId, toPerson(r.fromContactId, r.fromName, r.fromDeceased));
				}
				return {
					id: r.id,
					source: r.fromContactId,
					target: r.toContactId,
					kind: 'relationship',
					category: r.category,
					label: r.forwardLabel,
					directed: r.symmetric !== 1
				};
			});

			return {
				center: toPerson(centerRow.id, centerRow.name, centerRow.deceased),
				nodes: [...neighbors.values()],
				edges
			};
		}
	};
}
