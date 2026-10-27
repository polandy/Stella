import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { NextcloudSource } from '../../../import-match/card';
import type { SyncConflictKind } from '../../domain/nextcloud/sync-plan';
import { household } from './household';
import { contact } from './people';

/* The household's linked Nextcloud address book (docs/02 §2.16.3, docs/03 §3.3). */

/**
 * Where the last sync of a book stopped: the server's sync token, so the next one asks only for
 * what changed since. Lost or expired, the next sync reads the whole book again.
 */
export const nextcloudSync = sqliteTable(
	'nextcloud_sync',
	{
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		source: text('source').$type<NextcloudSource>().notNull(),
		syncToken: text('sync_token'),
		syncedAt: integer('synced_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.householdId, t.source] })]
);

/**
 * Every card of the book as Stella last saw it: the base a changed card is compared with, so
 * only what changed on the phone comes in, and the text a write-out starts from, so what Stella
 * does not keep stays on the card. Whether a card is linked lives in `contact_source_link`.
 */
export const nextcloudCard = sqliteTable(
	'nextcloud_card',
	{
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		source: text('source').$type<NextcloudSource>().notNull(),
		/** The card's path in the book, which a write goes to. */
		href: text('href').notNull(),
		/** The card's key, as `readContactCards` gives it: `contact_source_link.external_uid`. */
		uid: text('uid').notNull(),
		etag: text('etag').notNull(),
		vcard: text('vcard').notNull(),
		/**
		 * The linked person's kept-in-step facts when they were last in step with this card
		 * (`stellaHash`); a different one is a change in Stella to write out. Null writes it out
		 * at the next sync — a fresh link, or a conflict just answered.
		 */
		stellaHash: text('stella_hash')
	},
	(t) => [
		primaryKey({ columns: [t.householdId, t.source, t.href] }),
		uniqueIndex('nextcloud_card_uid_unique').on(t.householdId, t.source, t.uid)
	]
);

/**
 * A fact a linked card changed to something else than Stella holds (docs/02 §2.16.3), waiting
 * under *Data quality*. Stella's value stays, and the person is not written out, until someone
 * answers. One per person and fact; a newer change replaces it. Follows the person it names.
 */
export const nextcloudConflict = sqliteTable(
	'nextcloud_conflict',
	{
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		kind: text('kind').$type<SyncConflictKind>().notNull(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		source: text('source').$type<NextcloudSource>().notNull(),
		/** Stella's and the card's side as JSON: a name, a `PartialDate`, or nothing for a photo. */
		stellaValue: text('stella_value').notNull(),
		cardValue: text('card_value').notNull(),
		foundAt: integer('found_at').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.contactId, t.kind] }),
		index('nextcloud_conflict_household_idx').on(t.householdId)
	]
);
