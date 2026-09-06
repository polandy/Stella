import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import type { KinshipGraph, KinPerson, Pair, ParentEdge } from '../../kinship/kinship';
import {
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../relationships/type-keys';
import { contactVisibleTo, relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

/*
 * The one read that feeds the pure kinship engine (docs/02 §2.4.1). Both the person page
 * (through the relationship repository) and the explorer (through the graph repository) infer
 * from exactly this snapshot, so the two can never disagree about who is related to whom.
 *
 * Scoping happens here, before inference: only contacts the viewer may see and only
 * relationships whose endpoints are both visible (docs/03 §3.7).
 */
export function loadKinshipGraph(
	db: BunSQLiteDatabase<typeof schema>,
	viewer: Viewer
): KinshipGraph {
	const people: KinPerson[] = db
		.select({ id: contact.id, displayName: contact.displayName, gender: contact.gender })
		.from(contact)
		.where(contactVisibleTo(viewer))
		.all();

	const fromC = alias(contact, 'from_c');
	const toC = alias(contact, 'to_c');
	const rows = db
		.select({
			fromId: relationship.fromContactId,
			toId: relationship.toContactId,
			key: relationshipType.key
		})
		.from(relationship)
		.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
		.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
		.innerJoin(toC, eq(relationship.toContactId, toC.id))
		.where(relationshipVisibleTo(viewer, fromC, toC))
		.all();

	const parentEdges: ParentEdge[] = [];
	const siblingEdges: Pair[] = [];
	const partnerEdges: Pair[] = [];
	const storedPairs: Pair[] = [];
	for (const row of rows) {
		// Every visible pair counts as stored, so an existing link is never re-derived.
		storedPairs.push({ a: row.fromId, b: row.toId });
		if (row.key === PARENT_CHILD_TYPE_KEY) parentEdges.push({ parentId: row.fromId, childId: row.toId });
		else if (row.key === SIBLING_TYPE_KEY) siblingEdges.push({ a: row.fromId, b: row.toId });
		else if (PARTNER_TYPE_KEYS.includes(row.key)) partnerEdges.push({ a: row.fromId, b: row.toId });
	}
	return { people, parentEdges, siblingEdges, partnerEdges, storedPairs };
}
