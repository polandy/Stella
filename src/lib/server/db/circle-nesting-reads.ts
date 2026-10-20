import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Viewer } from '../access/visibility';
import type { CircleNestingReads } from '../domain/circles/nesting';
import type * as schema from './schema';
import { circle } from './schema';

/*
 * Drizzle adapter for the household's stored nesting (docs/08 §8.3): every circle's id and parent,
 * hidden ones included, because a hidden circle can sit between two the viewer sees and a loop
 * through it is a loop all the same (ADR-125, ADR-126). Ids only: the domain's loop check answers
 * yes or no from it, and nothing of a hidden circle reaches a screen.
 */

export function createDrizzleCircleNestingReads(
	db: BunSQLiteDatabase<typeof schema>
): CircleNestingReads {
	return {
		async parentsInHouseholdOf(viewer: Viewer) {
			const rows = db
				.select({ id: circle.id, parentId: circle.parentCircleId })
				.from(circle)
				.where(eq(circle.householdId, viewer.householdId))
				.all();
			return new Map(rows.map((r) => [r.id, r.parentId]));
		}
	};
}
