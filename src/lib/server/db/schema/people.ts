import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { now, type Visibility } from './columns';
import { household, user } from './household';

/* People and what is kept on each: fields, important dates, tags (docs/03 §3.3). */

export const contact = sqliteTable(
	'contact',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		firstName: text('first_name'),
		lastName: text('last_name'),
		nickname: text('nickname'),
		prefix: text('prefix'),
		suffix: text('suffix'),
		formerName: text('former_name'),
		displayName: text('display_name').notNull(),
		gender: text('gender'),
		pronouns: text('pronouns'),
		description: text('description'),
		avatarPhotoId: text('avatar_photo_id'),
		birthDate: text('birth_date'),
		birthDatePrecision: text('birth_date_precision')
			.$type<'full' | 'month_day' | 'year' | 'age'>()
			.notNull()
			.default('full'),
		isDeceased: integer('is_deceased').notNull().default(0),
		deathDate: text('death_date'),
		jobTitle: text('job_title'),
		company: text('company'),
		howWeMet: text('how_we_met'),
		metDate: text('met_date'),
		metPlace: text('met_place'),
		archivedAt: integer('archived_at'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		// Every household-scoped read, and the newest people first for the Home stream
		// (docs/04 §4.8); a lookup by household alone is served by its first column.
		index('contact_household_created_idx').on(t.householdId, t.createdAt)
	]
);

export const contactField = sqliteTable(
	'contact_field',
	{
		id: text('id').primaryKey(),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		kind: text('kind')
			.$type<'phone' | 'email' | 'address' | 'url' | 'social' | 'date' | 'custom'>()
			.notNull(),
		label: text('label'),
		value: text('value').notNull(),
		meta: text('meta'), // JSON
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [index('contact_field_contact_idx').on(t.contactId)]
);

export const importantDate = sqliteTable(
	'important_date',
	{
		id: text('id').primaryKey(),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		kind: text('kind').$type<'birthday' | 'anniversary' | 'custom'>().notNull(),
		label: text('label'),
		date: text('date').notNull(),
		recursYearly: integer('recurs_yearly').notNull().default(1),
		remind: integer('remind').notNull().default(0),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [index('important_date_contact_idx').on(t.contactId)]
);

export const tag = sqliteTable(
	'tag',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull().default('lavender'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [unique('tag_household_name').on(t.householdId, t.name)]
);

export const contactTag = sqliteTable(
	'contact_tag',
	{
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.contactId, t.tagId] }), index('contact_tag_tag_idx').on(t.tagId)]
);

export type Contact = typeof contact.$inferSelect;
