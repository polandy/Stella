import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ContactSource, SourceLinkState } from '../../domain/import/source-links';
import { household, user } from './household';
import { contact } from './people';

/* Other address books: which of their cards is which person (docs/03 §3.3). */

/*
 * The household's answer for one card of another address book: it is this person, or it was
 * skipped (docs/02 §2.16, docs/03 §contact_source_link). Keyed by the source and the card's
 * key, so the same export read again finds its answers. Household data like a declined
 * suggestion — anyone may take a skip back. Deleted with the person it names, carried through
 * a merge.
 */
export const contactSourceLink = sqliteTable(
	'contact_source_link',
	{
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		source: text('source').$type<ContactSource>().notNull(),
		/** The card's key in that address book: its UID, or what stands in for one. */
		externalUid: text('external_uid').notNull(),
		contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
		state: text('state').$type<SourceLinkState>().notNull(),
		/** The card's name when answered, so a skipped card can be listed without its file. */
		cardName: text('card_name').notNull(),
		/** The card as answered; a different hash is a changed card. */
		cardHash: text('card_hash').notNull(),
		answeredBy: text('answered_by')
			.notNull()
			.references(() => user.id),
		answeredAt: integer('answered_at').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.householdId, t.source, t.externalUid] }),
		index('contact_source_link_contact_idx').on(t.contactId),
		// A link names its person and a skip names nobody; the table, not the writer, holds it.
		check(
			'contact_source_link_state',
			sql`(${t.state} = 'linked' AND ${t.contactId} IS NOT NULL) OR (${t.state} = 'skipped' AND ${t.contactId} IS NULL)`
		)
	]
);
