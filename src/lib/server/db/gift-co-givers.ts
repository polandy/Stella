import { asc, eq, inArray } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { giverNameVisibleTo } from '../access/query-scoping';
import type { StoredCoGiver } from '../../gifts/giver';
import type { Viewer } from '../access/visibility';
import type { Gift } from '../domain/gifts/gifts';
import type * as schema from './schema';
import { giftCoGiver } from './schema';

/** The givers beside the first of each gift, as `viewer` may read them; a giver's own id stays. */
export function withCoGivers<G extends { id: string }>(
	db: BunSQLiteDatabase<typeof schema>,
	viewer: Viewer,
	gifts: G[]
): (G & { coGivers: StoredCoGiver[] })[] {
	if (gifts.length === 0) return [];
	const rows = db
		.select({
			giftId: giftCoGiver.giftId,
			contactId: giftCoGiver.contactId,
			name: giverNameVisibleTo(viewer, giftCoGiver.contactId),
			leftName: giftCoGiver.leftName
		})
		.from(giftCoGiver)
		.where(
			inArray(
				giftCoGiver.giftId,
				gifts.map((g) => g.id)
			)
		)
		.orderBy(asc(giftCoGiver.position))
		.all();
	return gifts.map((g) => ({
		...g,
		coGivers: rows
			.filter((row) => row.giftId === g.id)
			.map(({ contactId, name, leftName }) => ({ contactId, name, leftName }))
	}));
}

/** Store the givers beside a gift's first, replacing what was there. */
export function storeCoGivers(
	db: Pick<BunSQLiteDatabase<typeof schema>, 'delete' | 'insert'>,
	g: Pick<Gift, 'id' | 'coGivers'>
) {
	db.delete(giftCoGiver).where(eq(giftCoGiver.giftId, g.id)).run();
	if (g.coGivers.length === 0) return;
	db.insert(giftCoGiver)
		.values(
			g.coGivers.map(({ contactId, leftName }, position) => ({
				giftId: g.id,
				position,
				contactId,
				leftName
			}))
		)
		.run();
}
