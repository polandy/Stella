import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import type { Relation } from '../../../suggestions/types';
import { now } from './columns';
import { household, user } from './household';

/* Suggestions the household declined (docs/03 §3.3). */

/**
 * The claims the household has declined (docs/04 ADR-117).
 *
 * Keyed by the **claim** — a relation over an unordered pair — and never by the rule that
 * surfaced it: declining "Wing Kam is Steve's parent" answers those two people, and the answer
 * has to hold when another rule reaches the same pair tomorrow.
 *
 * Household-scoped rather than per user: the household decided. A row constrains only what
 * Stella *offers*; nothing here touches what the kinship engine derives or what a profile
 * shows, and deleting the row puts the suggestion back.
 */
export const suggestionDismissal = sqliteTable(
	'suggestion_dismissal',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		/**
		 * A relationship claim's relation, `last_name` for a declined surname, or `same_address`
		 * for a *Not the same* (docs/03 §3.9).
		 */
		relation: text('relation').$type<Relation | 'last_name' | 'same_address'>().notNull(),
		/**
		 * The two contact ids, sorted and space-separated, so either end names the same row — or,
		 * for `last_name`, the contact id and the folded surname; for `same_address`, the contact
		 * ids comma-joined and the folded line (`sameAddressKey`).
		 */
		pairKey: text('pair_key').notNull(),
		dismissedBy: text('dismissed_by')
			.notNull()
			.references(() => user.id),
		dismissedAt: integer('dismissed_at').notNull().default(now)
	},
	(t) => [unique('suggestion_dismissal_claim').on(t.householdId, t.relation, t.pairKey)]
);
