import { sql } from 'drizzle-orm';
import {
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	unique
} from 'drizzle-orm/sqlite-core';

/*
 * Drizzle schema — implementation of docs/03-data-model.md.
 * IDs: ULID (sortable). Timestamps: integer Unix epoch (ms, UTC).
 * Enums: text columns typed via $type<>() (SQLite has no native enum).
 */

const now = sql`(cast(strftime('%s','now') as integer) * 1000)`;

type Visibility = 'shared' | 'private';
type Role = 'admin' | 'member';

// ── Identity & household ────────────────────────────────────────────────

export const household = sqliteTable('household', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	defaultVisibility: text('default_visibility').$type<Visibility>().notNull().default('shared'),
	createdAt: integer('created_at').notNull().default(now),
	updatedAt: integer('updated_at').notNull().default(now)
});

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	householdId: text('household_id')
		.notNull()
		.references(() => household.id, { onDelete: 'cascade' }),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash'), // null for SSO-only users
	role: text('role').$type<Role>().notNull().default('member'),
	roleLocked: integer('role_locked').notNull().default(0),
	avatarPhotoId: text('avatar_photo_id'),
	themePref: text('theme_pref').$type<'system' | 'light' | 'dark'>().notNull().default('system'),
	accentPref: text('accent_pref').notNull().default('mauve'),
	defaultVisibility: text('default_visibility').$type<Visibility>().notNull().default('shared'),
	reducedMotion: integer('reduced_motion').notNull().default(0),
	totpSecret: text('totp_secret'),
	createdAt: integer('created_at').notNull().default(now),
	updatedAt: integer('updated_at').notNull().default(now)
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(), // hashed session token id
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	userAgent: text('user_agent'),
	ip: text('ip'),
	createdAt: integer('created_at').notNull().default(now)
});

export const identity = sqliteTable(
	'identity',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		issuer: text('issuer').notNull(),
		subject: text('subject').notNull(),
		emailAtLink: text('email_at_link'),
		lastLoginAt: integer('last_login_at'),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [unique('identity_iss_sub').on(t.issuer, t.subject)]
);

export const invitation = sqliteTable('invitation', {
	id: text('id').primaryKey(),
	householdId: text('household_id')
		.notNull()
		.references(() => household.id, { onDelete: 'cascade' }),
	email: text('email'),
	role: text('role').$type<Role>().notNull().default('member'),
	tokenHash: text('token_hash').notNull(),
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at').notNull(),
	acceptedAt: integer('accepted_at'),
	createdAt: integer('created_at').notNull().default(now)
});

// ── Contacts ────────────────────────────────────────────────────────────

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
		index('contact_household_idx').on(t.householdId),
		index('contact_visibility_idx').on(t.visibility)
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

// ── Relationships ─────────────────────────────────────────────────────────

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
		status: text('status'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [
		unique('relationship_unique').on(t.fromContactId, t.toContactId, t.typeId),
		index('relationship_from_idx').on(t.fromContactId),
		index('relationship_to_idx').on(t.toContactId)
	]
);

// ── Notes, interactions, dates ─────────────────────────────────────────────

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
	(t) => [primaryKey({ columns: [t.noteId, t.contactId] })]
);

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
		index('journal_contact_idx').on(t.contactId),
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
		kind: text('kind')
			.$type<'met' | 'call' | 'video' | 'message' | 'letter' | 'gift' | 'other'>()
			.notNull(),
		title: text('title'),
		description: text('description'),
		happenedAt: text('happened_at').notNull(),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(t) => [index('interaction_contact_idx').on(t.contactId)]
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
	(t) => [primaryKey({ columns: [t.interactionId, t.contactId] })]
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

// ── Media & tags ───────────────────────────────────────────────────────────

export const photo = sqliteTable(
	'photo',
	{
		id: text('id').primaryKey(),
		householdId: text('household_id')
			.notNull()
			.references(() => household.id, { onDelete: 'cascade' }),
		contactId: text('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
		// When set, this photo belongs to a journal entry (docs/02 §2.20) rather than the
		// gallery; it is removed with the entry.
		journalEntryId: text('journal_entry_id').references(() => journalEntry.id, {
			onDelete: 'cascade'
		}),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		filePath: text('file_path').notNull(),
		thumbPath: text('thumb_path').notNull(),
		mime: text('mime').notNull(),
		width: integer('width'),
		height: integer('height'),
		sizeBytes: integer('size_bytes'),
		caption: text('caption'),
		takenAt: text('taken_at'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [
		index('photo_contact_idx').on(t.contactId),
		index('photo_journal_idx').on(t.journalEntryId)
	]
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
	(t) => [primaryKey({ columns: [t.contactId, t.tagId] })]
);

// ── Circles & shared contexts ─────────────────────────────────────────────

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

// ── Activity feed ─────────────────────────────────────────────────────────

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
		action: text('action').$type<'create' | 'update' | 'delete' | 'archive' | 'merge'>().notNull(),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		contactId: text('contact_id'),
		visibility: text('visibility').$type<Visibility>().notNull().default('shared'),
		summary: text('summary').notNull(),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [index('activity_household_idx').on(t.householdId, t.createdAt)]
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Contact = typeof contact.$inferSelect;
