import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { now, type Visibility } from './columns';
import { household, user } from './household';
import { contact } from './people';

/* Circles and their members (docs/03 §3.3). */

export const circle = sqliteTable(
	'circle',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		name: text('name').notNull(),
		description: text('description'),
		kind: text('kind')
			.$type<
				| 'friends'
				| 'family'
				| 'school'
				| 'class'
				| 'course'
				| 'club'
				| 'team'
				| 'work'
				| 'neighborhood'
				| 'other'
			>()
			.notNull()
			.default('other'),
		color: text('color').notNull().default('blue'),
		parentCircleId: text('parent_circle_id'),
		startDate: text('start_date'),
		endDate: text('end_date'),
		archivedAt: integer('archived_at'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		index('circle_household_idx').on(t.householdId),
		// Self-reference for optional nesting (School › Class), declared at table level to
		// avoid the circular-type issue of an inline self `.references()`.
		foreignKey({
			columns: [t.parentCircleId],
			foreignColumns: [t.id],
			name: 'circle_parent_fk'
		}).onDelete('set null')
	]
);

export const circleMembership = sqliteTable(
	'circle_membership',
	{
		id: text('id').primaryKey(),
		circleId: text('circle_id')
			.notNull()
			.references(() => circle.id, { onDelete: 'cascade' }),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		role: text('role'),
		startDate: text('start_date'),
		endDate: text('end_date'),
		note: text('note'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		index('circle_membership_circle_idx').on(t.circleId),
		index('circle_membership_contact_idx').on(t.contactId)
	]
);
