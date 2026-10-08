import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	NewRelationshipType,
	RelationshipTypeFields,
	RelationshipTypeRepository
} from '../domain/relationships/relationship-types';
import type { RelationshipType } from '../domain/relationships/relationships';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for the RelationshipTypeRepository port (docs/08 §8.3): the household's
 * relationship vocabulary — the built-in types every household shares, and its own.
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

export function createDrizzleRelationshipTypeRepository(
	db: BunSQLiteDatabase<typeof schema>
): RelationshipTypeRepository {
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

		async mergeTypeInto(viewer: Viewer, fromId: string, intoId: string) {
			return db.transaction((tx) => {
				const from = tx
					.select({ id: relationshipType.id })
					.from(relationshipType)
					.where(customTypeOf(viewer, fromId))
					.get();
				const into = tx
					.select({ id: relationshipType.id })
					.from(relationshipType)
					.where(and(eq(relationshipType.id, intoId), typeUsableBy(viewer)))
					.get();
				if (!from || !into) return false;
				// Deliberately not scoped by visibility: the type is household vocabulary, and a row
				// left on it would keep it from being deleted. `or ignore` leaves a pair the target
				// already links where it was, so the delete below takes that duplicate with it —
				// the same rule as merging two people (contact-merge.ts).
				tx.run(
					sql`update or ignore relationship set type_id = ${intoId} where type_id = ${fromId} and household_id = ${viewer.householdId}`
				);
				tx.delete(relationship)
					.where(
						and(eq(relationship.typeId, fromId), eq(relationship.householdId, viewer.householdId))
					)
					.run();
				tx.delete(relationshipType).where(customTypeOf(viewer, fromId)).run();
				return true;
			});
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
		}
	};
}
