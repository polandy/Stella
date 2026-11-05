import { and, eq, inArray, ne } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import {
	ContradictoryRelationshipError,
	type NewRelationship,
	type RelationshipRepository,
	type RelationshipUpdate
} from '../domain/relationships/relationships';
import { GENERATION_TYPE_KEYS } from '../../relationships/type-keys';
import type * as schema from './schema';
import { contact, relationship, relationshipType } from './schema';

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

type Tx = Pick<BunSQLiteDatabase<typeof schema>, 'select'>;

/**
 * Refuse a generation link whose flipped pair is stored (docs/02 §2.4). The use-case asks the
 * same before it writes; asked here, inside the write's transaction, it is the database's
 * answer too — two members adding *parent of* in opposite directions at once cannot both land,
 * the way the `relationship_unique` index holds a duplicate.
 */
function refuseFlippedGeneration(
	tx: Tx,
	link: { fromContactId: string; toContactId: string; typeId: string },
	exceptId?: string
): void {
	const flipped = tx
		.select({ id: relationship.id })
		.from(relationship)
		.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
		.where(
			and(
				eq(relationship.fromContactId, link.toContactId),
				eq(relationship.toContactId, link.fromContactId),
				eq(relationship.typeId, link.typeId),
				inArray(relationshipType.key, [...GENERATION_TYPE_KEYS]),
				exceptId === undefined ? undefined : ne(relationship.id, exceptId)
			)
		)
		.get();
	if (flipped) throw new ContradictoryRelationshipError();
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
			db.transaction((tx) => {
				refuseFlippedGeneration(tx, rel);
				tx.insert(relationship).values(toRow(rel)).run();
			});
		},

		async insertAll(rels: readonly NewRelationship[]) {
			if (rels.length === 0) return;
			// One transaction, row by row so each is measured against the ones before it: a row
			// refused takes the others with it.
			db.transaction((tx) => {
				for (const rel of rels) {
					refuseFlippedGeneration(tx, rel);
					tx.insert(relationship).values(toRow(rel)).run();
				}
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
			return db.transaction((tx) => {
				if (!visibleToViewer(tx, viewer, id)) return false;
				if (update.retype) {
					refuseFlippedGeneration(
						tx,
						{ ...update.retype.endpoints, typeId: update.retype.typeId },
						id
					);
				}
				tx.update(relationship)
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
			});
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
