import { count, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { RelationshipTypeUsageReads } from '../domain/relationships/relationship-types';
import type * as schema from './schema';
import { contact, relationship } from './schema';

/*
 * Drizzle adapter for how much each relationship type is used (docs/08 §8.3) — the settings
 * screen offers *remove* only where the count is nought. Only links the viewer may see are
 * counted (both endpoints visible, docs/03 §3.7), the same as `countRelationshipsOfType`.
 */

export function createDrizzleRelationshipTypeUsageReads(
	db: BunSQLiteDatabase<typeof schema>
): RelationshipTypeUsageReads {
	return {
		async countRelationshipsByType(viewer: Viewer) {
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const rows = db
				.select({ typeId: relationship.typeId, n: count() })
				.from(relationship)
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(relationshipVisibleTo(viewer, fromC, toC))
				.groupBy(relationship.typeId)
				.all();
			return new Map(rows.map((r) => [r.typeId, r.n]));
		}
	};
}
