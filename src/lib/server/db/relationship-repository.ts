import { and, eq, isNull, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import type { KinshipGraph } from '../../kinship/kinship';
import { relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import { loadKinshipGraph } from './kinship-graph-read';
import { RELATIONSHIP_STATUSES, type RelationshipStatus } from '../../relationships/status';
import {
	describeRelationshipFor,
	type RelationshipDetails,
	type NewRelationship,
	type RelationshipRepository,
	type RelationshipType,
	type RelationshipView
} from '../domain/relationships/relationships';
import type {
	NewRelationshipType,
	RelationshipTypeFields,
	RelationshipTypeRepository
} from '../domain/relationships/relationship-types';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for the RelationshipRepository port (docs/08 §8.3). Reads for a contact
 * are scoped through the central `relationshipVisibleTo` (both endpoints must be visible),
 * and per-row labels are resolved with the pure `describeRelationshipFor`.
 */

type TypeRow = {
	id: string;
	householdId: string | null;
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipType['category'];
	symmetric: number;
	sortOrder: number;
};

const toType = (row: TypeRow): RelationshipType => ({
	id: row.id,
	householdId: row.householdId,
	key: row.key,
	forwardLabel: row.forwardLabel,
	reverseLabel: row.reverseLabel,
	category: row.category,
	symmetric: row.symmetric === 1,
	sortOrder: row.sortOrder
});

/**
 * The column is plain text, so a row written before the two statuses existed — or by an
 * import — can hold anything. Anything the domain does not know reads as "not said" rather
 * than being passed off as a status.
 */
const toStatus = (value: string | null): RelationshipStatus | null =>
	value !== null && RELATIONSHIP_STATUSES.includes(value as RelationshipStatus)
		? (value as RelationshipStatus)
		: null;

/**
 * The types a household may use: the built-in set (`household_id` null, seeded globally) plus
 * the ones this household defined. Another household's custom type is not merely hidden from
 * the picker — it cannot be resolved by id either, so it can never be stored (docs/03 §3.6).
 */
const typeUsableBy = (viewer: Viewer) =>
	or(isNull(relationshipType.householdId), eq(relationshipType.householdId, viewer.householdId));

/** One custom type of this household — never a built-in one, whose `household_id` is null. */
const customTypeOf = (viewer: Viewer, typeId: string) =>
	and(eq(relationshipType.id, typeId), eq(relationshipType.householdId, viewer.householdId));

const typeColumns = {
	id: relationshipType.id,
	householdId: relationshipType.householdId,
	key: relationshipType.key,
	forwardLabel: relationshipType.forwardLabel,
	reverseLabel: relationshipType.reverseLabel,
	category: relationshipType.category,
	symmetric: relationshipType.symmetric,
	sortOrder: relationshipType.sortOrder
};

/**
 * Whether this viewer may see the relationship at all — both endpoints visible, per §3.7.
 * Every write below asks first, so a relationship reached through a private person cannot be
 * changed or deleted, and the answer is the same as for one that is not there.
 */
function visibleToViewer(
	db: BunSQLiteDatabase<typeof schema>,
	viewer: Viewer,
	id: string
): boolean {
	const fromC = alias(contact, 'from_c');
	const toC = alias(contact, 'to_c');
	const row = db
		.select({ id: relationship.id })
		.from(relationship)
		.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
		.innerJoin(toC, eq(relationship.toContactId, toC.id))
		.where(and(eq(relationship.id, id), relationshipVisibleTo(viewer, fromC, toC)))
		.get();
	return row !== undefined && row !== null;
}

export function createDrizzleRelationshipRepository(
	db: BunSQLiteDatabase<typeof schema>
): RelationshipRepository & RelationshipTypeRepository {
	return {
		async listTypes(viewer: Viewer) {
			return db
				.select(typeColumns)
				.from(relationshipType)
				.where(typeUsableBy(viewer))
				.orderBy(relationshipType.sortOrder, relationshipType.forwardLabel)
				.all()
				.map(toType);
		},

		async getType(viewer: Viewer, typeId: string) {
			const row = db
				.select(typeColumns)
				.from(relationshipType)
				.where(and(eq(relationshipType.id, typeId), typeUsableBy(viewer)))
				.get();
			return row ? toType(row) : null;
		},

		async insertType(type: NewRelationshipType) {
			db.insert(relationshipType)
				.values({ ...type, symmetric: type.symmetric ? 1 : 0 })
				.run();
		},

		async updateTypeVisibleTo(viewer: Viewer, typeId: string, fields: RelationshipTypeFields) {
			// `householdId` in the predicate is what keeps the built-in set (household_id null)
			// read-only here as well, not only in the use-case.
			const changed = db
				.update(relationshipType)
				.set({ ...fields, symmetric: fields.symmetric ? 1 : 0 })
				.where(customTypeOf(viewer, typeId))
				.returning({ id: relationshipType.id })
				.all();
			return changed.length > 0;
		},

		async deleteTypeVisibleTo(viewer: Viewer, typeId: string) {
			const changed = db
				.delete(relationshipType)
				.where(customTypeOf(viewer, typeId))
				.returning({ id: relationshipType.id })
				.all();
			return changed.length > 0;
		},

		async countRelationshipsOfType(viewer: Viewer, typeId: string) {
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const rows = db
				.select({ id: relationship.id })
				.from(relationship)
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(and(eq(relationship.typeId, typeId), relationshipVisibleTo(viewer, fromC, toC)))
				.all();
			return rows.length;
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
					sinceDate: rel.sinceDate,
					status: rel.status,
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
					sinceDate: relationship.sinceDate,
					status: relationship.status,
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					fromName: fromC.displayName,
					toName: toC.displayName,
					typeKey: relationshipType.key,
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
						householdId: null,
						key: row.typeKey,
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
					sinceDate: row.sinceDate,
					status: toStatus(row.status),
					otherContactId: description.otherContactId,
					otherDisplayName,
					label: description.label,
					typeKey: row.typeKey,
					side: description.side,
					category: description.category,
					description: row.description
				};
			});
		},

		async updateDetailsVisibleTo(
			viewer: Viewer,
			id: string,
			details: RelationshipDetails,
			updatedAt: number
		) {
			if (!visibleToViewer(db, viewer, id)) return false;
			db.update(relationship)
				.set({
					note: details.description,
					sinceDate: details.sinceDate,
					status: details.status,
					updatedAt
				})
				.where(eq(relationship.id, id))
				.run();
			return true;
		},

		async removeVisibleTo(viewer: Viewer, id: string) {
			if (!visibleToViewer(db, viewer, id)) return false;
			db.delete(relationship).where(eq(relationship.id, id)).run();
			return true;
		},

		async loadKinshipGraphVisibleTo(viewer: Viewer): Promise<KinshipGraph> {
			return loadKinshipGraph(db, viewer);
		}
	};
}
