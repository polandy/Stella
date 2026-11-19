import { and, desc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import {
	linkedMomentVisibleTo,
	surpriseBrowsableBy,
	surpriseVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { DonePlan, Plan, PlanRepository } from '../domain/plans/plans';
import { birthOf } from '../../when/resolve';
import { whenColumns, whenOfColumns } from '../../when/when';
import type * as schema from './schema';
import { activityIdea, contact } from './schema';

/*
 * Drizzle adapter for the PlanRepository port (docs/dev/08 §8.3). Every read joins the person the
 * idea is to be done with and is scoped through the central `surpriseVisibleTo`, so a private idea
 * — or any idea on a private person — reaches only those allowed to see it, and a surprise never
 * the member it is with (docs/dev/03 §3.7). Writes act on an idea already found through such a read.
 * The lists name an idea's moment only to a viewer who may see it; `findVisibleTo` keeps it, so a
 * write by somebody else does not drop the link.
 */

const columns = {
	id: activityIdea.id,
	contactId: activityIdea.contactId,
	createdBy: activityIdea.createdBy,
	visibility: activityIdea.visibility,
	hiddenFromPerson: activityIdea.hiddenFromPerson,
	title: activityIdea.title,
	note: activityIdea.note,
	url: activityIdea.url,
	whenKind: activityIdea.whenKind,
	whenOn: activityIdea.whenOn,
	whenAge: activityIdea.whenAge,
	bookedAt: activityIdea.bookedAt,
	bookedBy: activityIdea.bookedBy,
	doneAt: activityIdea.doneAt,
	doneOn: activityIdea.doneOn,
	doneBy: activityIdea.doneBy,
	momentId: activityIdea.momentId,
	createdAt: activityIdea.createdAt,
	updatedAt: activityIdea.updatedAt
};

/** A row as the domain reads it: its when as one, its surprise flag a boolean. */
function planOf(row: typeof activityIdea.$inferSelect): Plan {
	const { whenKind, whenOn, whenAge, hiddenFromPerson, ...rest } = row;
	return {
		...rest,
		hiddenFromPerson: hiddenFromPerson !== 0,
		when: whenOfColumns({ whenKind, whenOn, whenAge })
	};
}

/** An idea as its row stores it. */
export function planRow(p: Plan): typeof activityIdea.$inferInsert {
	const { when, hiddenFromPerson, ...rest } = p;
	return { ...rest, hiddenFromPerson: hiddenFromPerson ? 1 : 0, ...whenColumns(when) };
}

export function createDrizzlePlanRepository(db: BunSQLiteDatabase<typeof schema>): PlanRepository {
	const visibleOn = (viewer: Viewer, contactId: string) =>
		and(eq(activityIdea.contactId, contactId), surpriseVisibleTo(viewer, activityIdea));
	const listed = (viewer: Viewer) => ({
		...columns,
		momentId: linkedMomentVisibleTo(viewer, activityIdea.momentId)
	});

	return {
		async insert(p) {
			db.insert(activityIdea).values(planRow(p)).run();
		},

		async findVisibleTo(viewer, contactId, planId) {
			const row = db
				.select(columns)
				.from(activityIdea)
				.innerJoin(contact, eq(activityIdea.contactId, contact.id))
				.where(and(eq(activityIdea.id, planId), visibleOn(viewer, contactId)))
				.get();
			return row ? planOf(row) : null;
		},

		async update(p) {
			const row = planRow(p);
			db.update(activityIdea)
				.set({
					visibility: row.visibility,
					hiddenFromPerson: row.hiddenFromPerson,
					title: row.title,
					note: row.note,
					url: row.url,
					whenKind: row.whenKind,
					whenOn: row.whenOn,
					whenAge: row.whenAge,
					bookedAt: row.bookedAt,
					bookedBy: row.bookedBy,
					doneAt: row.doneAt,
					doneOn: row.doneOn,
					doneBy: row.doneBy,
					momentId: row.momentId,
					updatedAt: row.updatedAt
				})
				.where(eq(activityIdea.id, p.id))
				.run();
		},

		async remove(planId) {
			db.delete(activityIdea).where(eq(activityIdea.id, planId)).run();
		},

		async listOpenVisibleTo(viewer) {
			// Home places them (`src/lib/plans/home.ts`): the rules are pure and tested there.
			return db
				.select({
					...columns,
					contactName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					birthDate: contact.birthDate,
					birthDatePrecision: contact.birthDatePrecision
				})
				.from(activityIdea)
				.innerJoin(contact, eq(activityIdea.contactId, contact.id))
				.where(
					and(
						isNull(activityIdea.doneAt),
						eq(contact.isDeceased, 0),
						// Home is a browsing surface: an archived person is out (docs/dev/04 §4.9).
						surpriseBrowsableBy(viewer, activityIdea)
					)
				)
				.all()
				.map(({ contactName, avatarPhotoId, birthDate, birthDatePrecision, ...row }) => ({
					...planOf(row),
					contactName,
					avatarPhotoId,
					birth: birthOf({ birthDate, birthDatePrecision })
				}));
		},

		async listForContactVisibleTo(viewer, contactId) {
			// The card sorts and folds them (`src/lib/plans/`): the rules are pure and tested there.
			return db
				.select(listed(viewer))
				.from(activityIdea)
				.innerJoin(contact, eq(activityIdea.contactId, contact.id))
				.where(visibleOn(viewer, contactId))
				.orderBy(desc(activityIdea.createdAt), desc(activityIdea.id))
				.all()
				.map(planOf);
		},

		async listStoryPageForContactVisibleTo(viewer, contactId, opts) {
			const conditions = [visibleOn(viewer, contactId), isNotNull(activityIdea.doneOn)];
			if (opts.before) {
				const { doneOn, doneAt } = opts.before;
				// Keyset: strictly older than the cursor in (doneOn, doneAt) order.
				conditions.push(
					or(
						lt(activityIdea.doneOn, doneOn),
						and(eq(activityIdea.doneOn, doneOn), lt(activityIdea.doneAt, doneAt))
					)!
				);
			}
			return db
				.select(listed(viewer))
				.from(activityIdea)
				.innerJoin(contact, eq(activityIdea.contactId, contact.id))
				.where(and(...conditions))
				.orderBy(desc(activityIdea.doneOn), desc(activityIdea.doneAt))
				.limit(opts.limit)
				.all()
				.map(planOf)
				.filter((p): p is DonePlan => p.doneOn !== null && p.doneAt !== null);
		}
	};
}
