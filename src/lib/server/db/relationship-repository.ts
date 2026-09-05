import { and, eq, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import type { KinshipGraph, KinPerson, Pair, ParentEdge } from '../../kinship/kinship';
import { contactVisibleTo, relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import {
	describeRelationshipFor,
	type NewRelationship,
	type RelationshipRepository,
	type RelationshipType,
	type RelationshipView
} from '../domain/relationships/relationships';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for the RelationshipRepository port (docs/08 §8.3). Reads for a contact
 * are scoped through the central `relationshipVisibleTo` (both endpoints must be visible),
 * and per-row labels are resolved with the pure `describeRelationshipFor`.
 */

/*
 * Relationship type keys the kinship engine reasons from (docs/02 §2.4.1); everything else
 * is a stored pair it must not re-derive over.
 */
const PARENT_CHILD_KEY = 'parent_child';
const SIBLING_KEY = 'sibling';
const PARTNER_KEYS: readonly string[] = ['partner', 'spouse'];

type TypeRow = {
	id: string;
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipType['category'];
	symmetric: number;
	sortOrder: number;
};

const toType = (row: TypeRow): RelationshipType => ({
	id: row.id,
	key: row.key,
	forwardLabel: row.forwardLabel,
	reverseLabel: row.reverseLabel,
	category: row.category,
	symmetric: row.symmetric === 1,
	sortOrder: row.sortOrder
});

const typeColumns = {
	id: relationshipType.id,
	key: relationshipType.key,
	forwardLabel: relationshipType.forwardLabel,
	reverseLabel: relationshipType.reverseLabel,
	category: relationshipType.category,
	symmetric: relationshipType.symmetric,
	sortOrder: relationshipType.sortOrder
};

export function createDrizzleRelationshipRepository(
	db: BunSQLiteDatabase<typeof schema>
): RelationshipRepository {
	return {
		async listTypes() {
			return db.select(typeColumns).from(relationshipType).orderBy(relationshipType.sortOrder).all().map(toType);
		},

		async getType(typeId: string) {
			const row = db.select(typeColumns).from(relationshipType).where(eq(relationshipType.id, typeId)).get();
			return row ? toType(row) : null;
		},

		async exists(fromContactId: string, toContactId: string, typeId: string) {
			const row = db
				.select({ id: relationship.id })
				.from(relationship)
				.where(
					and(
						eq(relationship.fromContactId, fromContactId),
						eq(relationship.toContactId, toContactId),
						eq(relationship.typeId, typeId)
					)
				)
				.get();
			return row !== undefined && row !== null;
		},

		async insert(rel: NewRelationship) {
			// Domain `description` maps to the table's `note` column (docs/03 §relationship).
			db.insert(relationship)
				.values({
					id: rel.id,
					householdId: rel.householdId,
					fromContactId: rel.fromContactId,
					toContactId: rel.toContactId,
					typeId: rel.typeId,
					note: rel.description,
					createdBy: rel.createdBy,
					createdAt: rel.createdAt,
					updatedAt: rel.updatedAt
				})
				.run();
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<RelationshipView[]> {
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');

			const rows = db
				.select({
					id: relationship.id,
					description: relationship.note,
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					fromName: fromC.displayName,
					toName: toC.displayName,
					forwardLabel: relationshipType.forwardLabel,
					reverseLabel: relationshipType.reverseLabel,
					category: relationshipType.category,
					symmetric: relationshipType.symmetric,
					sortOrder: relationshipType.sortOrder
				})
				.from(relationship)
				.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(
					and(
						or(eq(relationship.fromContactId, contactId), eq(relationship.toContactId, contactId)),
						relationshipVisibleTo(viewer, fromC, toC)
					)
				)
				.orderBy(relationshipType.sortOrder)
				.all();

			return rows.map((row) => {
				const description = describeRelationshipFor(
					contactId,
					{ fromContactId: row.fromContactId, toContactId: row.toContactId },
					{
						id: '',
						key: '',
						forwardLabel: row.forwardLabel,
						reverseLabel: row.reverseLabel,
						category: row.category,
						symmetric: row.symmetric === 1,
						sortOrder: row.sortOrder
					}
				);
				const otherDisplayName =
					description.otherContactId === row.fromContactId ? row.fromName : row.toName;
				return {
					id: row.id,
					otherContactId: description.otherContactId,
					otherDisplayName,
					label: description.label,
					category: description.category,
					description: row.description
				};
			});
		},

		async loadKinshipGraphVisibleTo(viewer: Viewer): Promise<KinshipGraph> {
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
				if (row.key === PARENT_CHILD_KEY) parentEdges.push({ parentId: row.fromId, childId: row.toId });
				else if (row.key === SIBLING_KEY) siblingEdges.push({ a: row.fromId, b: row.toId });
				else if (PARTNER_KEYS.includes(row.key)) partnerEdges.push({ a: row.fromId, b: row.toId });
			}
			return { people, parentEdges, siblingEdges, partnerEdges, storedPairs };
		}
	};
}
