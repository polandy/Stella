import { and, asc, eq, inArray, isNotNull, notExists } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { giftVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { GiftGroup, GiftGroupRepository, VisibleGiftGroup } from '../domain/gifts/gift-groups';
import { birthOf } from '../../when/resolve';
import { whenColumns, whenOfColumns } from '../../when/when';
import { columnsFor, giftOf, giftRow } from './gift-repository';
import { withCoGivers } from './gift-co-givers';
import type * as schema from './schema';
import { contact, gift, giftGroup } from './schema';

const groupGiftColumns = (viewer: Viewer) => ({
	...columnsFor(viewer),
	contactName: contact.displayName,
	birthDate: contact.birthDate,
	birthDatePrecision: contact.birthDatePrecision
});

// Drizzle adapter for GiftGroupRepository (ADR-134): a group is read through its visible gifts.

function groupRow(g: GiftGroup) {
	const { when, hiddenFromRecipients, ...rest } = g;
	return { ...rest, hiddenFromRecipients: hiddenFromRecipients ? 1 : 0, ...whenColumns(when) };
}

function groupOf(row: typeof giftGroup.$inferSelect): GiftGroup {
	const { whenKind, whenOn, whenAge, hiddenFromRecipients, ...rest } = row;
	return {
		...rest,
		hiddenFromRecipients: hiddenFromRecipients !== 0,
		when: whenOfColumns({ whenKind, whenOn, whenAge })
	};
}

export function createDrizzleGiftGroupRepository(
	db: BunSQLiteDatabase<typeof schema>
): GiftGroupRepository {
	/** The gifts of these groups the viewer may see, by name, with each group they are in. */
	function readGroups(viewer: Viewer, groupIds: readonly string[]): VisibleGiftGroup[] {
		if (groupIds.length === 0) return [];
		const rows = db
			.select(groupGiftColumns(viewer))
			.from(gift)
			.innerJoin(contact, eq(gift.contactId, contact.id))
			.where(and(inArray(gift.groupId, [...groupIds]), giftVisibleTo(viewer, gift)))
			.orderBy(asc(contact.displayName), asc(gift.id))
			.all();
		const groups = db
			.select()
			.from(giftGroup)
			.where(
				and(inArray(giftGroup.id, [...groupIds]), eq(giftGroup.householdId, viewer.householdId))
			)
			.all()
			.map(groupOf);
		return groups.flatMap((group) => {
			const gifts = withCoGivers(
				db,
				viewer,
				rows
					.filter((row) => row.groupId === group.id)
					.map(({ birthDate, birthDatePrecision, ...row }) => ({
						...giftOf(row),
						birth: birthOf({ birthDate, birthDatePrecision })
					}))
			);
			return gifts.length > 0 ? [{ group, gifts }] : [];
		});
	}

	return {
		async insert(group, gifts) {
			db.transaction((tx) => {
				tx.insert(giftGroup).values(groupRow(group)).run();
				if (gifts.length > 0) tx.insert(gift).values(gifts.map(giftRow)).run();
			});
		},

		async findVisibleTo(viewer, groupId) {
			return readGroups(viewer, [groupId])[0] ?? null;
		},

		async listVisibleTo(viewer, groupIds) {
			return readGroups(viewer, groupIds);
		},

		async listForContactVisibleTo(viewer, contactId) {
			const ids = db
				.selectDistinct({ groupId: gift.groupId })
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(
					and(eq(gift.contactId, contactId), isNotNull(gift.groupId), giftVisibleTo(viewer, gift))
				)
				.all()
				.flatMap((r) => (r.groupId === null ? [] : [r.groupId]));
			return readGroups(viewer, ids);
		},

		async write(change) {
			const leaving = [...(change.remove ?? []), ...(change.release ?? [])];
			db.transaction((tx) => {
				const touched = leaving.length
					? tx
							.selectDistinct({ groupId: gift.groupId })
							.from(gift)
							.where(and(inArray(gift.id, leaving), isNotNull(gift.groupId)))
							.all()
							.flatMap((r) => (r.groupId === null ? [] : [r.groupId]))
					: [];
				if (change.group)
					tx.update(giftGroup)
						.set(groupRow(change.group))
						.where(eq(giftGroup.id, change.group.id))
						.run();
				if (change.insert?.length) tx.insert(gift).values(change.insert.map(giftRow)).run();
				for (const g of change.update ?? [])
					tx.update(gift).set(giftRow(g)).where(eq(gift.id, g.id)).run();
				if (change.remove?.length)
					tx.delete(gift)
						.where(inArray(gift.id, [...change.remove]))
						.run();
				if (change.release?.length)
					tx.update(gift)
						.set({ groupId: null })
						.where(inArray(gift.id, [...change.release]))
						.run();
				// A group nobody's gift is in any more is gone too.
				if (touched.length)
					tx.delete(giftGroup)
						.where(
							and(
								inArray(giftGroup.id, touched),
								notExists(tx.select().from(gift).where(eq(gift.groupId, giftGroup.id)))
							)
						)
						.run();
			});
		}
	};
}
