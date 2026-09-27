import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { isCommandType } from '../../commands/commands';
import type { CommandReceipt, CommandReceiptRepository } from '../domain/commands/dispatch';
import type * as schema from './schema';
import { commandReceipt } from './schema';

/*
 * Drizzle adapter for the CommandReceiptRepository port (docs/concepts/offline-capture.md §3).
 * A claim is the primary key itself: `INSERT … ON CONFLICT DO NOTHING` either takes the id or
 * leaves the earlier claim standing, in one statement, so two runs of the same command cannot
 * both think they own it. A result is stored as JSON and read back as it was written.
 */

export function createDrizzleCommandReceiptRepository(
	db: BunSQLiteDatabase<typeof schema>
): CommandReceiptRepository {
	/** The stored row for `id` as a receipt, or null. */
	function read(id: string): CommandReceipt | null {
		const row = db.select().from(commandReceipt).where(eq(commandReceipt.id, id)).get();
		if (!row) return null;
		if (!isCommandType(row.type)) {
			throw new Error(`Command receipt ${row.id} names an unknown command: ${row.type}.`);
		}
		return {
			id: row.id,
			memberId: row.memberId,
			householdId: row.householdId,
			type: row.type,
			status: row.status,
			result: row.result === null ? null : JSON.parse(row.result),
			claimedAt: row.claimedAt
		};
	}

	return {
		async find(id): Promise<CommandReceipt | null> {
			return read(id);
		},

		async claim(receipt): Promise<CommandReceipt | null> {
			const taken = db
				.insert(commandReceipt)
				.values({ ...receipt, status: 'pending' })
				.onConflictDoNothing()
				.returning({ id: commandReceipt.id })
				.all();
			if (taken.length > 0) return null;

			const existing = read(receipt.id);
			if (!existing) throw new Error(`Command receipt ${receipt.id} vanished while being claimed.`);
			return existing;
		},

		async reclaim(id, claimedAt, at): Promise<boolean> {
			const moved = db
				.update(commandReceipt)
				.set({ claimedAt: at })
				.where(
					and(
						eq(commandReceipt.id, id),
						eq(commandReceipt.status, 'pending'),
						eq(commandReceipt.claimedAt, claimedAt)
					)
				)
				.returning({ id: commandReceipt.id })
				.all();
			return moved.length > 0;
		},

		async complete(id, result, at): Promise<void> {
			db.update(commandReceipt)
				.set({ status: 'applied', result: JSON.stringify(result), completedAt: at })
				.where(eq(commandReceipt.id, id))
				.run();
		},

		async release(id): Promise<void> {
			db.delete(commandReceipt)
				.where(and(eq(commandReceipt.id, id), eq(commandReceipt.status, 'pending')))
				.run();
		}
	};
}
