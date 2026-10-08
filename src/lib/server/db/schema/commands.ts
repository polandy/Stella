import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { household, user } from './household';

/* Command receipts: each command applied once (docs/03 §3.3). */

/*
 * A command id that has been claimed or applied (docs/03 §3.3). The
 * dispatcher claims an id before running its handler and keeps the result when done, so a
 * command sent twice — a phone that lost its connection after Stella saved — is applied once.
 * Never replayed and nothing is derived from it; it holds ids, not content, and is kept for
 * good so a device offline for months still cannot send anything twice.
 */
export const commandReceipt = sqliteTable('command_receipt', {
	id: text('id').primaryKey(),
	householdId: text('household_id')
		.notNull()
		.references(() => household.id, { onDelete: 'cascade' }),
	memberId: text('member_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	status: text('status').$type<'pending' | 'applied'>().notNull(),
	/** The handler's result as JSON, once applied. */
	result: text('result'),
	claimedAt: integer('claimed_at').notNull(),
	completedAt: integer('completed_at')
});
