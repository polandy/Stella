import { and, count, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { circleTreeVisibleTo } from '../access/circle-tree';
import { contactColumnsVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { CircleTreeReads } from '../domain/circles/tree';
import { circleColumns, toCircle } from './circle-columns';
import type * as schema from './schema';
import { circle, circleMembership, contact } from './schema';

/*
 * Drizzle adapter for the circle nesting (docs/08 §8.3): the household's circles in one query,
 * each with its direct members the reader may see counted (the contact's visibility in the JOIN,
 * as on the cards). The rows are the whole household's, because a hidden sub-circle is still
 * counted under its parent; `circleTreeVisibleTo` drops everything else of it before the rows
 * leave this adapter.
 */

export function createDrizzleCircleTreeReads(
	db: BunSQLiteDatabase<typeof schema>
): CircleTreeReads {
	return {
		async treeVisibleTo(viewer: Viewer) {
			const rows = db
				.select({
					...circleColumns,
					parentId: circle.parentCircleId,
					memberCount: count(contact.id)
				})
				.from(circle)
				.leftJoin(circleMembership, eq(circleMembership.circleId, circle.id))
				.leftJoin(
					contact,
					and(eq(contact.id, circleMembership.contactId), contactColumnsVisibleTo(viewer, contact))
				)
				.where(eq(circle.householdId, viewer.householdId))
				.groupBy(circle.id)
				.orderBy(circle.name)
				.all();
			return circleTreeVisibleTo(
				viewer,
				rows.map((r) => ({ ...toCircle(r), parentId: r.parentId, memberCount: r.memberCount }))
			);
		}
	};
}
