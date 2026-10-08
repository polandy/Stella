import { and, count, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import {
	circleColumnsVisibleTo,
	contactColumnsVisibleTo,
	membershipVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import {
	CIRCLE_PREVIEW_SIZE,
	type CircleWithCount,
	type MemberPreview
} from '../domain/circles/circles';
import type { CircleDirectoryReads } from '../domain/circles/directory';
import { circleColumns, toCircle } from './circle-columns';
import type * as schema from './schema';
import { circle, circleMembership, contact } from './schema';

/*
 * Drizzle adapter for the circles overview (docs/08 §8.3). A circle is scoped by
 * `circleColumnsVisibleTo`, a face by `membershipVisibleTo` (circle AND contact visible, §3.7).
 * Member counts only include members the viewer may see — the contact visibility lives in the
 * JOIN condition so a circle with only hidden members still lists (as 0).
 */

export function createDrizzleCircleDirectoryReads(
	db: BunSQLiteDatabase<typeof schema>
): CircleDirectoryReads {
	return {
		async listVisibleTo(viewer: Viewer): Promise<CircleWithCount[]> {
			const rows = db
				.select({ ...circleColumns, memberCount: count(contact.id) })
				.from(circle)
				.leftJoin(circleMembership, eq(circleMembership.circleId, circle.id))
				.leftJoin(
					contact,
					and(eq(contact.id, circleMembership.contactId), contactColumnsVisibleTo(viewer, contact))
				)
				.where(circleColumnsVisibleTo(viewer, circle))
				.groupBy(circle.id)
				.orderBy(circle.name)
				.all();
			// The faces on each card: every visible membership once, cut per circle below.
			const faces = db
				.select({
					circleId: circleMembership.circleId,
					contactId: contact.id,
					displayName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(membershipVisibleTo(viewer, circle, contact))
				.orderBy(contact.displayName)
				.all();
			const previews = new Map<string, MemberPreview[]>();
			for (const { circleId, ...member } of faces) {
				const list = previews.get(circleId) ?? [];
				if (list.length < CIRCLE_PREVIEW_SIZE) list.push(member);
				previews.set(circleId, list);
			}

			return rows.map((r) => ({
				...toCircle(r),
				memberCount: r.memberCount,
				preview: previews.get(r.id as string) ?? []
			}));
		}
	};
}
