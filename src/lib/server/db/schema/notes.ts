import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { now, type Visibility } from './columns';
import { user } from './household';
import { contact } from './people';

/* Notes: reference facts about a person, and the people they mention (docs/03 §3.3). */

export const note = sqliteTable(
	'note',
	{
		id: text('id').primaryKey(),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		title: text('title'),
		body: text('body').notNull(),
		isPinned: integer('is_pinned').notNull().default(0),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [index('note_contact_idx').on(t.contactId)]
);

export const noteMention = sqliteTable(
	'note_mention',
	{
		noteId: text('note_id')
			.notNull()
			.references(() => note.id, { onDelete: 'cascade' }),
		contactId: text('contact_id')
			.notNull()
			.references(() => contact.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.noteId, t.contactId] }),
		index('note_mention_contact_idx').on(t.contactId)
	]
);
