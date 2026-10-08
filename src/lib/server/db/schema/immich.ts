import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { household, user } from './household';
import { contact } from './people';

/* The household's Immich library: links and turned-down faces (docs/03 §3.3). */

/*
 * Which person in the household's Immich library a contact is (docs/02 §2.24.2,
 * docs/03 §immich_link). One per contact; it has no visibility of its own and follows the
 * contact's. One Immich person belongs to one contact. Deleted with the contact, carried
 * through a merge.
 */
export const immichLink = sqliteTable(
	'immich_link',
	{
		contactId: text('contact_id')
			.primaryKey()
			.references(() => contact.id, { onDelete: 'cascade' }),
		/** Immich's id for the person (a UUID). Not a foreign key: it lives in another program. */
		immichPersonId: text('immich_person_id').notNull(),
		linkedBy: text('linked_by')
			.notNull()
			.references(() => user.id),
		linkedAt: integer('linked_at').notNull()
	},
	// One Immich person is one contact (docs/04 ADR-096). The index, not a read before the write,
	// is what holds it when two members link the same face at once.
	(t) => [uniqueIndex('immich_link_person_unique').on(t.immichPersonId)]
);

/*
 * A proposal of *Find your people* a member turned down: this contact is not that Immich person
 * (docs/02 §2.24.7, docs/03 §immich_ignore). Household data like a link — no
 * visibility of its own, seen by whoever sees the contact — kept with who said so and when, so
 * the list can show it and anyone may take it back. Deleted with the contact, carried through a
 * merge.
 */
export const immichIgnore = sqliteTable(
	'immich_ignore',
	{
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		/** Immich's id for the person (a UUID). Not a foreign key: it lives in another program. */
		immichPersonId: text('immich_person_id').notNull(),
		ignoredBy: text('ignored_by')
			.notNull()
			.references(() => user.id),
		ignoredAt: integer('ignored_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.contactId, t.immichPersonId] })]
);

/*
 * A face of *New from Immich* the household said is nobody to add (docs/02
 * §2.24.7, docs/03 §immich_name_ignore). There is no contact to hang it on, so it belongs to the
 * household: every member sees it and may take it back. Kept with who said so and when.
 */
export const immichNameIgnore = sqliteTable(
	'immich_name_ignore',
	{
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		/** Immich's id for the person (a UUID). Not a foreign key: it lives in another program. */
		immichPersonId: text('immich_person_id').notNull(),
		ignoredBy: text('ignored_by')
			.notNull()
			.references(() => user.id),
		ignoredAt: integer('ignored_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.householdId, t.immichPersonId] })]
);
