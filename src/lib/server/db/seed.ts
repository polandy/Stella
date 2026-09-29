import { sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../domain/relationships/built-in-types';
import type * as schema from './schema';
import { relationshipType as relationshipTypeTable } from './schema';

/*
 * Idempotent seeding of the built-in, global relationship types (docs/03 §3.6). Runs on
 * startup after migrations, keyed on the stable ids: a type added in a release arrives on the
 * next boot, and the sort order is brought up to date so a new type lands in its group rather
 * than after the ones an older install already had. Nothing else is overwritten.
 */

export function seedRelationshipTypes(db: BunSQLiteDatabase<typeof schema>): void {
	const rows = BUILT_IN_RELATIONSHIP_TYPES.map((type) => ({
		id: type.id,
		householdId: null,
		key: type.key,
		forwardLabel: type.forwardLabel,
		reverseLabel: type.reverseLabel,
		category: type.category,
		symmetric: type.symmetric ? 1 : 0,
		sortOrder: type.sortOrder
	}));
	db.insert(relationshipTypeTable)
		.values(rows)
		.onConflictDoUpdate({
			target: relationshipTypeTable.id,
			set: { sortOrder: sql`excluded.sort_order` }
		})
		.run();
}
