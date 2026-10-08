import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { now, type Visibility } from './columns';
import { user } from './household';
import { contact } from './people';

/* What makes up a person's story: journal entries, touchpoints and gifts (docs/03 §3.0). */

/*
 * A per-person diary (docs/02 §2.20). Each entry belongs to a contact, is authored by a
 * household member, and is *about* a specific day (`entry_date`, an ISO YYYY-MM-DD string,
 * distinct from the created_at timestamp). Body is Markdown. Visibility follows the child-record
 * rule (private ⇒ only the author). One entry per (contact, author, day, visibility) slot, so a
 * member keeps at most one shared and one private entry for a contact on any given day.
 */
export const journalEntry = sqliteTable(
	'journal_entry',
	{
		id: text('id').primaryKey(),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		entryDate: text('entry_date').notNull(),
		title: text('title'),
		body: text('body').notNull(),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		// In the story's order, so a page of it is read rather than sorted (docs/02 §2.23).
		index('journal_contact_day_idx').on(t.contactId, t.entryDate, t.createdAt),
		index('journal_updated_idx').on(t.updatedAt),
		unique('journal_day_slot').on(t.contactId, t.createdBy, t.entryDate, t.visibility)
	]
);

/*
 * A person referenced from a journal entry via an @-mention (docs/02 §2.20.1). Denormalises the
 * mention for the reverse "Mentioned in" lookup on the referenced contact; the source person and
 * author are read from the parent entry. Rebuilt from the entry body on each save; cascades away
 * with the entry or the contact. Self-references are not stored.
 */
export const journalMention = sqliteTable(
	'journal_mention',
	{
		journalEntryId: text('journal_entry_id')
			.notNull()
			.references(() => journalEntry.id, { onDelete: 'cascade' }),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.journalEntryId, t.contactId] }),
		index('journal_mention_contact_idx').on(t.contactId)
	]
);

export const interaction = sqliteTable(
	'interaction',
	{
		id: text('id').primaryKey(),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		kind: text('kind').$type<'met' | 'call' | 'video' | 'message' | 'letter' | 'other'>().notNull(),
		title: text('title'),
		description: text('description'),
		happenedAt: text('happened_at').notNull(),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		// A person's touchpoints in story order, and the day of their last one (docs/04 §4.8).
		index('interaction_contact_happened_idx').on(t.contactId, t.happenedAt, t.createdAt),
		// The newest touchpoints first, for the Home stream.
		index('interaction_created_idx').on(t.createdAt)
	]
);

export const interactionParticipant = sqliteTable(
	'interaction_participant',
	{
		interactionId: text('interaction_id')
			.notNull()
			.references(() => interaction.id, { onDelete: 'cascade' }),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.interactionId, t.contactId] }),
		index('interaction_participant_contact_idx').on(t.contactId)
	]
);

/*
 * A present for one person (docs/02 §2.25): an idea, a gift the household gave, or one it
 * received. An idea and the gift it became are one row — *Mark as given* sets `state` and the
 * day. Visibility follows the child-record rule (private ⇒ only the author).
 */
export const gift = sqliteTable(
	'gift',
	{
		id: text('id').primaryKey(),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		state: text('state').$type<'idea' | 'given' | 'received'>().notNull(),
		title: text('title').notNull(),
		note: text('note'),
		url: text('url'),
		// ISO YYYY-MM-DD; null while an idea.
		givenOn: text('given_on'),
		// A preset key (`birthday`, `christmas`, `anniversary`) or free text.
		occasion: text('occasion'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		// A person's gifts by state, and their given and received ones in story order.
		index('gift_contact_state_given_idx').on(t.contactId, t.state, t.givenOn)
	]
);
