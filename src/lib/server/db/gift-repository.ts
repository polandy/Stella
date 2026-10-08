import { and, asc, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { DatedGift, Gift, GiftRepository } from '../domain/gifts/gifts';
import type * as schema from './schema';
import { contact, gift } from './schema';

/*
 * Drizzle adapter for the GiftRepository port (docs/08 §8.3). Every read joins the person the
 * gift is for and is scoped through the central `childRecordVisibleTo`, so a private gift — or
 * any gift on a private person — reaches only those allowed to see it (docs/03 §3.7). Writes
 * act on a gift the use-case has already found through such a read.
 */

const columns = {
	id: gift.id,
	contactId: gift.contactId,
	createdBy: gift.createdBy,
	visibility: gift.visibility,
	state: gift.state,
	title: gift.title,
	note: gift.note,
	url: gift.url,
	givenOn: gift.givenOn,
	occasion: gift.occasion,
	createdAt: gift.createdAt,
	updatedAt: gift.updatedAt
};

const DATED_STATES = ['given', 'received'] as const;

export function createDrizzleGiftRepository(db: BunSQLiteDatabase<typeof schema>): GiftRepository {
	const visibleOn = (viewer: Viewer, contactId: string) =>
		and(
			eq(gift.contactId, contactId),
			childRecordVisibleTo(viewer, { visibility: gift.visibility, createdBy: gift.createdBy })
		);

	return {
		async insert(g: Gift) {
			db.insert(gift).values(g).run();
		},

		async findVisibleTo(viewer, contactId, giftId) {
			const row = db
				.select(columns)
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(and(eq(gift.id, giftId), visibleOn(viewer, contactId)))
				.get();
			return row ?? null;
		},

		async update(g: Gift) {
			db.update(gift)
				.set({
					visibility: g.visibility,
					state: g.state,
					title: g.title,
					note: g.note,
					url: g.url,
					givenOn: g.givenOn,
					occasion: g.occasion,
					updatedAt: g.updatedAt
				})
				.where(eq(gift.id, g.id))
				.run();
		},

		async remove(giftId) {
			db.delete(gift).where(eq(gift.id, giftId)).run();
		},

		async listForContactVisibleTo(viewer, contactId) {
			return (
				db
					.select(columns)
					.from(gift)
					.innerJoin(contact, eq(gift.contactId, contact.id))
					.where(visibleOn(viewer, contactId))
					// Ideas first (they have no day), newest noted first; then the newest day.
					.orderBy(asc(sql`${gift.givenOn} IS NOT NULL`), desc(gift.givenOn), desc(gift.createdAt))
					.all()
			);
		},

		async countOpenIdeasVisibleTo(viewer, contactIds) {
			if (contactIds.length === 0) return new Map();
			const rows = db
				.select({ contactId: gift.contactId, ideas: count() })
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(
					and(
						inArray(gift.contactId, [...contactIds]),
						eq(gift.state, 'idea'),
						childRecordVisibleTo(viewer, { visibility: gift.visibility, createdBy: gift.createdBy })
					)
				)
				.groupBy(gift.contactId)
				.all();
			return new Map(rows.map((row) => [row.contactId, row.ideas]));
		},

		async listStoryPageForContactVisibleTo(viewer, contactId, opts) {
			const conditions = [visibleOn(viewer, contactId), inArray(gift.state, [...DATED_STATES])];
			if (opts.before) {
				const { givenOn, createdAt } = opts.before;
				// Keyset: strictly older than the cursor in (givenOn, createdAt) order.
				conditions.push(
					or(
						lt(gift.givenOn, givenOn),
						and(eq(gift.givenOn, givenOn), lt(gift.createdAt, createdAt))
					)!
				);
			}
			const rows = db
				.select(columns)
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(and(...conditions))
				.orderBy(desc(gift.givenOn), desc(gift.createdAt))
				.limit(opts.limit)
				.all();
			// A given or received gift always has its day (`domain/gifts`); the state filter says so.
			return rows.filter((row): row is DatedGift => row.givenOn !== null && row.state !== 'idea');
		}
	};
}
