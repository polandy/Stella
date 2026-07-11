import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import type { GraphEdge, GraphModel, GraphNode } from '../../graph/model/types';
import {
	circleColumnsVisibleTo,
	contactVisibleTo,
	membershipVisibleTo,
	relationshipVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type * as schema from './schema';
import { circle, circleMembership, contact, relationship, relationshipType } from './schema';

/*
 * Loads the whole *visible* graph for a viewer in one slim, access-scoped snapshot (docs/04
 * §4.11). The browser wraps this in an in-memory source and runs all exploration (ego build,
 * expand, path) client-side with no further requests — the server does one bulk read instead
 * of a round-trip per node. Only the projection the graph needs is sent (id/label/kind + typed
 * edges), never full contact records. Scoping matches the app: a contact is visible per §3.7,
 * and a relationship edge appears only when both endpoints are visible. Circle-membership and
 * derived-kinship edges join here in M2 without changing the shape.
 */

export interface GraphRepository {
	loadVisibleGraph(viewer: Viewer): Promise<GraphModel>;
}

export function createDrizzleGraphRepository(
	db: BunSQLiteDatabase<typeof schema>
): GraphRepository {
	return {
		async loadVisibleGraph(viewer: Viewer): Promise<GraphModel> {
			const contactRows = db
				.select({ id: contact.id, label: contact.displayName, deceased: contact.isDeceased })
				.from(contact)
				.where(contactVisibleTo(viewer))
				.all();

			const nodes: GraphNode[] = contactRows.map((r) => ({
				id: r.id,
				kind: 'person',
				label: r.label,
				deceased: r.deceased === 1
			}));

			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const relRows = db
				.select({
					id: relationship.id,
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					category: relationshipType.category,
					forwardLabel: relationshipType.forwardLabel,
					symmetric: relationshipType.symmetric
				})
				.from(relationship)
				.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(relationshipVisibleTo(viewer, fromC, toC))
				.all();

			const edges: GraphEdge[] = relRows.map((r) => ({
				id: r.id,
				source: r.fromContactId,
				target: r.toContactId,
				kind: 'relationship',
				category: r.category,
				label: r.forwardLabel,
				directed: r.symmetric !== 1
			}));

			// Circles (shared contexts) become their own node kind; memberships become edges
			// connecting a contact to its circle (docs/02 §2.4.2). Both are visibility-scoped.
			const circleRows = db
				.select({ id: circle.id, name: circle.name })
				.from(circle)
				.where(circleColumnsVisibleTo(viewer, circle))
				.all();
			for (const c of circleRows) nodes.push({ id: c.id, kind: 'circle', label: c.name });

			const membershipRows = db
				.select({
					id: circleMembership.id,
					circleId: circleMembership.circleId,
					contactId: circleMembership.contactId,
					role: circleMembership.role
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(membershipVisibleTo(viewer, circle, contact))
				.all();
			for (const m of membershipRows) {
				edges.push({
					id: m.id,
					source: m.circleId,
					target: m.contactId,
					kind: 'membership',
					label: m.role ?? undefined
				});
			}

			return { nodes, edges };
		}
	};
}
