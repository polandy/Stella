import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { now, type Visibility } from './columns';
import { household, user } from './household';

/* The household's activity log (docs/03 §activity_log). */

export const activityLog = sqliteTable(
	'activity_log',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		actorId: text('actor_id')
			.notNull()
			.references(() => user.id),
		action: text('action')
			.$type<'create' | 'update' | 'delete' | 'archive' | 'merge' | 'export' | 'import'>()
			.notNull(),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		contactId: text('contact_id'),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		summary: text('summary').notNull(),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [index('activity_household_idx').on(t.householdId, t.createdAt)]
);
