import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { now, type Visibility } from './columns';
import { household, user } from './household';
import { contact } from './people';
import { journalEntry } from './story';

/* Photos: galleries, framings, cuts and journal pictures (docs/03 §photo). */

export const photo = sqliteTable(
	'photo',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
		// When set, this photo belongs to a journal entry (docs/02 §2.20) rather than the
		// gallery; it is removed with the entry — by the repository, not by the database.
		// The migration that added this column (`0002`) could not carry a cascade, and
		// rebuilding the table to add one would have to drop `photo` while `contact` still
		// points at it. The declaration says what the database enforces (docs/03 §photo).
		journalEntryId: text('journal_entry_id').references(() => journalEntry.id),
		// When set, this row is the avatar framing of that gallery photo (docs/02 §2.14): the
		// square someone chose, rendered once, never shown in the gallery itself. No foreign
		// key, like `avatar_photo_id`: the repository removes a framing with its photo.
		framingOf: text('framing_of'),
		// When set, this photo belongs to that circle's gallery (docs/02 §2.4.2) and to nobody's
		// person gallery. No foreign key, like `framing_of`: SQLite cannot add one with a cascade
		// to an existing table, so the repository removes a circle's photos with the circle.
		circleId: text('circle_id'),
		// The circle role the photo shows, as it was picked (one of the circle's roles, folded
		// by case when matched); null = the circle as a whole, a candidate for its cover.
		circleRole: text('circle_role'),
		// When set, this photo is a profile picture that was cut from that circle photo and is now
		// a photo of its own (docs/02 §2.14): a reference, never a copy. No
		// foreign key, like `framing_of`; the repository clears it when the group photo goes.
		cutFrom: text('cut_from'),
		// The chosen square, in the full-size picture's pixels, so choosing again starts there.
		cropX: real('crop_x'),
		cropY: real('crop_y'),
		cropSize: real('crop_size'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		filePath: text('file_path').notNull(),
		thumbPath: text('thumb_path').notNull(),
		// A 1600 px rendition beside a larger full picture, which the grid and the lightbox load
		// instead of it; null when the full picture is already that small (docs/02 §2.4.2).
		viewPath: text('view_path'),
		mime: text('mime').notNull(),
		width: integer('width'),
		height: integer('height'),
		sizeBytes: integer('size_bytes'),
		caption: text('caption'),
		takenAt: text('taken_at'),
		// When the household pinned this gallery photo as one of the person's favourites
		// (docs/02 §2.14); null when it is not one. A moment rather than a flag, because the
		// pins are shown most recently pinned first (domain/media/gallery-order.ts).
		pinnedAt: integer('pinned_at'),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [
		index('photo_contact_idx').on(t.contactId),
		index('photo_journal_idx').on(t.journalEntryId),
		index('photo_framing_idx').on(t.framingOf),
		// One framing per photo and person: a group photo is cut once for each face on it.
		uniqueIndex('photo_framing_person_idx')
			.on(t.framingOf, t.contactId)
			.where(sql`${t.framingOf} IS NOT NULL`),
		index('photo_circle_idx').on(t.circleId)
	]
);
