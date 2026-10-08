import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import type { Locale } from '../../../i18n/locales';
import { now } from './columns';

/* Identity and household: the household, its members and how they sign in (docs/03 §3.3). */

type Role = 'admin' | 'member';

export const household = sqliteTable('household', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
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
	// The contact this member *is*, or null while they have not said (docs/02 §2.1.3).
	// No foreign key, like `avatar_photo_id` above: SQLite cannot add one with an ON DELETE
	// action through ALTER TABLE, and a plain reference would refuse to delete that person.
	// Deleting the contact clears the link and a merge repoints it (contact-repository.ts,
	// domain/contacts/merge-plan.ts), so a member never points at a record that is gone.
	selfContactId: text('self_contact_id'),
	// Null until the member picks one: an unchosen language must not outrank the browser's.
	localePref: text('locale_pref').$type<Locale>(),
	themePref: text('theme_pref').$type<'system' | 'light' | 'dark'>().notNull().default('system'),
	accentPref: text('accent_pref').notNull().default('mauve'),
	totpSecret: text('totp_secret'),
	createdAt: integer('created_at').notNull().default(now),
	updatedAt: integer('updated_at').notNull().default(now)
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(), // hashed session token id
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at').notNull(),
		userAgent: text('user_agent'),
		ip: text('ip'),
		// ID token of the OIDC sign-in behind this session; the `id_token_hint` for single logout.
		oidcIdToken: text('oidc_id_token'),
		createdAt: integer('created_at').notNull().default(now)
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

/*
 * A member's API token (docs/02 §2.16.1, docs/03 §3.2). Stored as the SHA-256 of the secret,
 * like a session; unlike one it has a name, a fixed last day and a record of its last use.
 */
export const apiToken = sqliteTable(
	'api_token',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: integer('created_at').notNull().default(now),
		expiresAt: integer('expires_at').notNull(),
		lastUsedAt: integer('last_used_at')
	},
	(t) => [index('api_token_user_idx').on(t.userId)]
);

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

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
