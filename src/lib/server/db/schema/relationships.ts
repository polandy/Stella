import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { CURRENT_RELATIONSHIP_STATUS } from '../../../relationships/status';
import { now } from './columns';
import { household, user } from './household';
import { contact } from './people';

/* Relationships someone entered between two people (docs/03 §3.3). */

export const relationshipType = sqliteTable('relationship_type', {
	id: text('id').primaryKey(),
	householdId: text('household_id').references(() => household.id, { onDelete: 'cascade' }),
	key: text('key').notNull(),
	forwardLabel: text('forward_label').notNull(),
	reverseLabel: text('reverse_label').notNull(),
	category: text('category')
		.$type<'family' | 'romantic' | 'social' | 'professional' | 'other'>()
		.notNull(),
	symmetric: integer('symmetric').notNull().default(0),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const relationship = sqliteTable(
	'relationship',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		fromContactId: text('from_contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		toContactId: text('to_contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		typeId: text('type_id')
			.notNull()
			.references(() => relationshipType.id),
		note: text('note'),
		sinceDate: text('since_date'),
		// A link that is on record holds until someone ends it, so there is no unset status:
		// a row that says nothing says `current` (docs/03 §relationship).
		status: text('status').notNull().default(CURRENT_RELATIONSHIP_STATUS),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		unique('relationship_unique').on(t.fromContactId, t.toContactId, t.typeId),
		// A link from a person to themselves means nothing; `relationshipPair` refuses it first.
		check('relationship_not_to_self', sql`${t.fromContactId} <> ${t.toContactId}`),
		index('relationship_from_idx').on(t.fromContactId),
		index('relationship_to_idx').on(t.toContactId),
		index('relationship_type_idx').on(t.typeId),
		// The newest links first, for the Home stream (docs/04 §4.8).
		index('relationship_created_idx').on(t.createdAt)
	]
);
