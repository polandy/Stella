import { and, asc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { giftVisibleTo } from '../access/query-scoping';
import type { GiftGroup, GiftGroupRepository } from '../domain/gifts/gift-groups';
import { whenColumns, whenOfColumns } from '../../when/when';
import { columns as giftColumns, giftOf, giftRow } from './gift-repository';
import type * as schema from './schema';
import { contact, gift, giftGroup } from './schema';

/*
 * Drizzle adapter for the GiftGroupRepository port (docs/dev/02 §2.25.11, ADR-134). A group is read
 * through its gifts: the viewer sees it when they see one of them, scoped by the central
 * `giftVisibleTo`, so a surprise group never reaches a member whose own person it is for.
 */

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
	return {
		async insert(group, gifts) {
			db.transaction((tx) => {
				tx.insert(giftGroup).values(groupRow(group)).run();
				if (gifts.length > 0) tx.insert(gift).values(gifts.map(giftRow)).run();
			});
		},

		async findVisibleTo(viewer, groupId) {
			const gifts = db
				.select(giftColumns)
				.from(gift)
				.innerJoin(contact, eq(gift.contactId, contact.id))
				.where(and(eq(gift.groupId, groupId), giftVisibleTo(viewer, gift)))
				.orderBy(asc(contact.displayName), asc(gift.id))
				.all()
				.map(giftOf);
			if (gifts.length === 0) return null;
			const row = db
				.select()
				.from(giftGroup)
				.where(and(eq(giftGroup.id, groupId), eq(giftGroup.householdId, viewer.householdId)))
				.get();
			return row ? { group: groupOf(row), gifts } : null;
		}
	};
}
