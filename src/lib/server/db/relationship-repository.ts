import { and, eq, inArray, ne } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	NewRelationship,
	RelationshipRepository,
	RelationshipUpdate
} from '../domain/relationships/relationships';
import type * as schema from './schema';
import { contact, relationship } from './schema';

/*
 * Drizzle adapter for the RelationshipRepository port (docs/08 §8.3): the links between people
 * as they are written. Every write to a stored link asks `relationshipVisibleTo` first (both
 * endpoints must be visible, docs/03 §3.7). What the pages list are read models of their own:
 * `relationship-tie-reads.ts`, `kinship-graph-read.ts`, and the vocabulary with its usage,
 * `relationship-type-repository.ts` and `relationship-type-usage-reads.ts`.
 */

/**
 * Whether this viewer may see the relationship at all — both endpoints visible, per §3.7.
 * Every write below asks first, so a relationship reached through a private person cannot be
 * changed or deleted, and the answer is the same as for one that is not there.
 */
function visibleToViewer(
	db: Pick<BunSQLiteDatabase<typeof schema>, 'select'>,
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

/** A link as its row; the domain's `description` is the table's `note` (docs/03 §relationship). */
const toRow = (rel: NewRelationship) => ({
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
});

export function createDrizzleRelationshipRepository(
	db: BunSQLiteDatabase<typeof schema>
): RelationshipRepository {
	return {
		async exists(fromContactId: string, toContactId: string, typeId: string, exceptId?: string) {
			const row = db
				.select({ id: relationship.id })
				.from(relationship)
				.where(
					and(
						eq(relationship.fromContactId, fromContactId),
						eq(relationship.toContactId, toContactId),
						eq(relationship.typeId, typeId),
						exceptId === undefined ? undefined : ne(relationship.id, exceptId)
					)
				)
				.get();
			return row !== undefined && row !== null;
		},

		async insert(rel: NewRelationship) {
			db.insert(relationship).values(toRow(rel)).run();
		},

		async insertAll(rels: readonly NewRelationship[]) {
			if (rels.length === 0) return;
			// One statement in one transaction: a row refused by the database takes the others with it.
			db.transaction((tx) => {
				tx.insert(relationship).values(rels.map(toRow)).run();
			});
		},

		async findVisibleTo(viewer: Viewer, id: string) {
			if (!visibleToViewer(db, viewer, id)) return null;
			const row = db
				.select({
					id: relationship.id,
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					typeId: relationship.typeId
				})
				.from(relationship)
				.where(eq(relationship.id, id))
				.get();
			return row ?? null;
		},

		async updateVisibleTo(
			viewer: Viewer,
			id: string,
			update: RelationshipUpdate,
			updatedAt: number
		) {
			if (!visibleToViewer(db, viewer, id)) return false;
			db.update(relationship)
				.set({
					note: update.description,
					sinceDate: update.sinceDate,
					status: update.status,
					// A retype can move the row's endpoints: the type decides the stored direction.
					...(update.retype
						? {
								typeId: update.retype.typeId,
								fromContactId: update.retype.endpoints.fromContactId,
								toContactId: update.retype.endpoints.toContactId
							}
						: {}),
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

		async removeAllVisibleTo(viewer: Viewer, ids: readonly string[]) {
			return db.transaction((tx) => {
				const unique = [...new Set(ids)];
				if (!unique.every((id) => visibleToViewer(tx, viewer, id))) return false;
				tx.delete(relationship).where(inArray(relationship.id, unique)).run();
				return true;
			});
		}
	};
}
