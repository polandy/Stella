import { and, asc, desc, eq, inArray, isNotNull, lt, max, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { giftBrowsableBy, giftVisibleTo, giverNameVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { DatedGift, Gift, GiftRepository } from '../domain/gifts/gifts';
import { birthOf } from '../../when/resolve';
import { whenColumns, whenOfColumns, type When, type WhenColumns } from '../../when/when';
import type { DatePrecision } from '../../dates/partial-date';
import type * as schema from './schema';
import { withCoGivers, storeCoGivers } from './gift-co-givers';
import { contact, gift, giftCoGiver } from './schema';

/*
 * Drizzle adapter for the GiftRepository port (docs/dev/08 §8.3). Every read joins the person the
 * gift is for and is scoped through the central `giftVisibleTo`, so a private gift — or any gift
 * on a private person — reaches only those allowed to see it, and a surprise never the member it is
 * for (docs/dev/03 §3.7). Writes act on a gift the use-case has already found through such a read.
 */

/** A whole gift as the domain reads it; the query joins its person. */
export const columns = {
	id: gift.id,
	contactId: gift.contactId,
	createdBy: gift.createdBy,
	visibility: gift.visibility,
	hiddenFromRecipient: gift.hiddenFromRecipient,
	state: gift.state,
	title: gift.title,
	note: gift.note,
	url: gift.url,
	givenOn: gift.givenOn,
	occasion: gift.occasion,
	whenKind: gift.whenKind,
	whenOn: gift.whenOn,
	whenAge: gift.whenAge,
	whenCheckedOn: gift.whenCheckedOn,
	groupId: gift.groupId,
	giverContactId: gift.giverContactId,
	giverIsHousehold: gift.giverIsHousehold,
	giverLeftName: gift.giverLeftName,
	storedAt: gift.storedAt,
	createdAt: gift.createdAt,
	updatedAt: gift.updatedAt
};

/** A whole gift as this viewer reads it: with its giver's name, where they may see that person. */
export const columnsFor = (viewer: Viewer) => ({
	...columns,
	giverName: giverNameVisibleTo(viewer, gift.giverContactId)
});

interface BirthColumns {
	birthDate: string | null;
	birthDatePrecision: DatePrecision;
}

const birthColumns = {
	birthDate: contact.birthDate,
	birthDatePrecision: contact.birthDatePrecision
};

/** A row as the domain reads it: its three when columns as one when. */
function fromRow<R extends WhenColumns>(
	row: R
): Omit<R, keyof WhenColumns> & { when: When | null } {
	const { whenKind, whenOn, whenAge, ...rest } = row;
	return { ...rest, when: whenOfColumns({ whenKind, whenOn, whenAge }) };
}

/** A whole gift row as the domain reads it: its when as one, its two flags booleans. */
export function giftOf<
	R extends WhenColumns & { hiddenFromRecipient: number; giverIsHousehold: number }
>(row: R) {
	const { hiddenFromRecipient, giverIsHousehold, ...rest } = fromRow(row);
	return {
		...rest,
		hiddenFromRecipient: hiddenFromRecipient !== 0,
		giverIsHousehold: giverIsHousehold !== 0
	};
}

/** A row read with its person's birth date, as the domain reads that. */
function withBirth<R extends WhenColumns & BirthColumns>(row: R) {
	const { birthDate, birthDatePrecision, ...rest } = row;
	return { ...fromRow(rest), birth: birthOf({ birthDate, birthDatePrecision }) };
}

/** A gift as its row stores it: its when as the three when columns. */
export function giftRow(g: Gift) {
	const {
		when,
		hiddenFromRecipient,
		giverIsHousehold,
		giverName: _read,
		coGivers: _beside,
		...rest
	} = g;
	return {
		...rest,
		hiddenFromRecipient: hiddenFromRecipient ? 1 : 0,
		giverIsHousehold: giverIsHousehold ? 1 : 0,
		...whenColumns(when)
	};
}

const DATED_STATES = ['given', 'received'] as const;

/** How many places *Bought…* offers as chips; a household keeps its presents in a few. */
const PLACES_OFFERED = 8;

export function createDrizzleGiftRepository(db: BunSQLiteDatabase<typeof schema>): GiftRepository {
	const visibleOn = (viewer: Viewer, contactId: string) =>
		and(eq(gift.contactId, contactId), giftVisibleTo(viewer, gift));

	/** The viewer's gifts in `states` with whom each is for, newest noted first, archived people out. */
	const browsableIn = (viewer: Viewer, states: readonly Gift['state'][]) =>
		withCoGivers(
			db,
			viewer,
			db
				.select({
					...columnsFor(viewer),
					contactName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					...birthColumns
				})
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(
					and(
						inArray(gift.state, [...states]),
						// A list to act on is a browsing surface: an archived person is out (docs/dev/04 §4.9).
						giftBrowsableBy(viewer, gift)
					)
				)
				.orderBy(desc(gift.createdAt))
				.all()
				.map(({ birthDate, birthDatePrecision, ...row }) => ({
					...giftOf(row),
					birth: birthOf({ birthDate, birthDatePrecision })
				}))
		);

	return {
		async insert(g: Gift) {
			db.transaction((tx) => {
				tx.insert(gift).values(giftRow(g)).run();
				storeCoGivers(tx, g);
			});
		},

		async findVisibleTo(viewer, contactId, giftId) {
			const row = db
				.select(columnsFor(viewer))
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(and(eq(gift.id, giftId), visibleOn(viewer, contactId)))
				.get();
			return row ? withCoGivers(db, viewer, [giftOf(row)])[0]! : null;
		},

		async update(g: Gift) {
			db.transaction((tx) => {
				tx.update(gift)
					.set({
						visibility: g.visibility,
						hiddenFromRecipient: g.hiddenFromRecipient ? 1 : 0,
						state: g.state,
						title: g.title,
						note: g.note,
						url: g.url,
						givenOn: g.givenOn,
						occasion: g.occasion,
						...whenColumns(g.when),
						whenCheckedOn: g.whenCheckedOn,
						giverContactId: g.giverContactId,
						giverIsHousehold: g.giverIsHousehold ? 1 : 0,
						giverLeftName: g.giverLeftName,
						storedAt: g.storedAt,
						updatedAt: g.updatedAt
					})
					.where(eq(gift.id, g.id))
					.run();
				storeCoGivers(tx, g);
			});
		},

		async remove(giftId) {
			db.delete(gift).where(eq(gift.id, giftId)).run();
		},

		async listForContactVisibleTo(viewer, contactId) {
			return withCoGivers(
				db,
				viewer,
				db
					.select(columnsFor(viewer))
					.from(gift)
					.innerJoin(contact, eq(gift.contactId, contact.id))
					.where(visibleOn(viewer, contactId))
					// Ideas first (they have no day), newest noted first; then the newest day.
					.orderBy(asc(sql`${gift.givenOn} IS NOT NULL`), desc(gift.givenOn), desc(gift.createdAt))
					.all()
					.map(giftOf)
			);
		},

		async listOpenIdeaWhensVisibleTo(viewer, contactIds) {
			if (contactIds.length === 0) return [];
			return db
				.select({
					contactId: gift.contactId,
					whenKind: gift.whenKind,
					whenOn: gift.whenOn,
					whenAge: gift.whenAge,
					whenCheckedOn: gift.whenCheckedOn,
					createdAt: gift.createdAt,
					...birthColumns
				})
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(
					and(
						inArray(gift.contactId, [...contactIds]),
						eq(gift.state, 'idea'),
						giftVisibleTo(viewer, gift)
					)
				)
				.all()
				.map(withBirth);
		},

		async listOpenIdeasVisibleTo(viewer) {
			return browsableIn(viewer, ['idea']);
		},

		async listPlannedVisibleTo(viewer) {
			return browsableIn(viewer, ['idea', 'bought']);
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
			const rows = withCoGivers(
				db,
				viewer,
				db
					.select(columnsFor(viewer))
					.from(gift)
					.innerJoin(contact, eq(gift.contactId, contact.id))
					.where(and(...conditions))
					.orderBy(desc(gift.givenOn), desc(gift.createdAt))
					.limit(opts.limit)
					.all()
					.map(giftOf)
			);
			// A given or received gift always has its day (`domain/gifts`); the state filter says so.
			return rows.filter(
				(row): row is DatedGift =>
					row.givenOn !== null && (row.state === 'given' || row.state === 'received')
			);
		},

		async listGivenByVisibleTo(viewer, giverId) {
			const beside = db
				.select({ giftId: giftCoGiver.giftId })
				.from(giftCoGiver)
				.where(eq(giftCoGiver.contactId, giverId));
			return withCoGivers(
				db,
				viewer,
				db
					.select({ ...columnsFor(viewer), contactName: contact.displayName })
					.from(gift)
					.innerJoin(contact, eq(gift.contactId, contact.id))
					.where(
						and(
							or(eq(gift.giverContactId, giverId), inArray(gift.id, beside)),
							giftVisibleTo(viewer, gift)
						)
					)
					.orderBy(desc(gift.createdAt))
					.all()
					.map(giftOf)
			);
		},

		async listBoughtVisibleTo(viewer, contactIds) {
			if (contactIds.length === 0) return [];
			return withCoGivers(
				db,
				viewer,
				db
					.select({
						id: gift.id,
						contactId: gift.contactId,
						title: gift.title,
						giverContactId: gift.giverContactId,
						giverIsHousehold: gift.giverIsHousehold,
						giverLeftName: gift.giverLeftName,
						giverName: giverNameVisibleTo(viewer, gift.giverContactId)
					})
					.from(gift)
					.innerJoin(contact, eq(gift.contactId, contact.id))
					.where(
						and(
							inArray(gift.contactId, [...contactIds]),
							eq(gift.state, 'bought'),
							giftVisibleTo(viewer, gift)
						)
					)
					.orderBy(asc(gift.updatedAt), asc(gift.id))
					.all()
			).map((row) => ({ ...row, giverIsHousehold: row.giverIsHousehold !== 0 }));
		},

		async listStoredPlacesVisibleTo(viewer) {
			return db
				.select({ place: gift.storedAt, latest: max(gift.updatedAt) })
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(and(isNotNull(gift.storedAt), giftVisibleTo(viewer, gift)))
				.groupBy(gift.storedAt)
				.orderBy(desc(max(gift.updatedAt)))
				.limit(PLACES_OFFERED)
				.all()
				.flatMap((row) => (row.place === null ? [] : [row.place]));
		}
	};
}
