import * as v from 'valibot';

/*
 * The raw variables Stella reads, apart from the checks across them (`config.ts`). Its own module
 * so `src/env.ts` can declare the keys to SvelteKit without importing `$app/env/private` itself.
 */

const boolFrom = (fallback: boolean) =>
	v.pipe(
		v.optional(v.string(), fallback ? 'true' : 'false'),
		v.transform((s) => s.toLowerCase() === 'true' || s === '1')
	);

const csvFrom = v.pipe(
	v.optional(v.string(), ''),
	v.transform((s) =>
		s
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean)
	)
);

export const RawSchema = v.object({
	STELLA_URL: v.optional(v.string(), 'http://localhost:5173'),
	DATABASE_PATH: v.optional(v.string(), './data/stella.db'),
	MEDIA_DIR: v.optional(v.string(), './data/media'),
	SESSION_SECRET: v.optional(v.string(), 'dev-insecure-secret-change-me'),

	AUTH_LOCAL_ENABLED: boolFrom(true),
	AUTH_OIDC_ENABLED: boolFrom(false),

	// `json` writes one access-log line per request to stdout (docs/dev/07 §7.4).
	LOG_FORMAT: v.optional(v.picklist(['text', 'json']), 'text'),

	// Serve the development-only workbench pages under /settings/debug from a build too.
	// Off by default: they are diagnostics, untranslated, and of no use to a household.
	DEBUG_PAGES: boolFrom(false),

	// Populate the database with the demo dataset on startup (test phase only). Idempotent.
	SEED_DEMO: boolFrom(false),

	// What a gift's value is counted in (docs/dev/02 §2.25.16): a plain string appended to the
	// amount, nothing converted. Empty shows the number alone; unset is CHF.
	GIFT_CURRENCY: v.optional(v.string(), 'CHF'),

	// Ask GitHub once a day whether a newer Stella has been released (docs/dev/02 §2.17.1).
	// On by default; it is the only request an instance makes on its own, and a household
	// can opt out with UPDATE_CHECK=false.
	UPDATE_CHECK: boolFrom(true),

	// Which feed that asks. Empty means Stella's own releases; a fork points this at its
	// own, and the e2e suite at a local stub (docs/dev/07 §7.4).
	UPDATE_FEED_URL: v.optional(v.string(), ''),

	// A person's photos from Immich (docs/dev/02 §2.24, docs/dev/04 §4.5). URL and key together or not
	// at all; without IMMICH_URL the feature appears nowhere. IMMICH_PUBLIC_URL is what links
	// for the browser point at and defaults to IMMICH_URL. IMMICH_DEMO wires an in-memory
	// stand-in for the demo/e2e server instead (SEED_DEMO only).
	IMMICH_URL: v.optional(v.string(), ''),
	IMMICH_PUBLIC_URL: v.optional(v.string(), ''),
	IMMICH_API_KEY: v.optional(v.string(), ''),
	IMMICH_DEMO: boolFrom(false),

	// The household's Nextcloud address book, linked both ways (docs/dev/02 §2.16.3). All three or
	// none; the app password stays here, out of the database. NEXTCLOUD_DEMO wires an in-memory
	// book for the demo/e2e server instead (SEED_DEMO only).
	NEXTCLOUD_ADDRESS_BOOK_URL: v.optional(v.string(), ''),
	NEXTCLOUD_USER: v.optional(v.string(), ''),
	NEXTCLOUD_APP_PASSWORD: v.optional(v.string(), ''),
	NEXTCLOUD_DEMO: boolFrom(false),

	OIDC_ISSUER: v.optional(v.string(), ''),
	OIDC_CLIENT_ID: v.optional(v.string(), ''),
	OIDC_CLIENT_SECRET: v.optional(v.string(), ''),
	OIDC_REDIRECT_URI: v.optional(v.string(), ''),
	OIDC_SCOPES: v.optional(v.string(), 'openid profile email groups'),
	OIDC_PROVIDER_NAME: v.optional(v.string(), 'authelia'),
	OIDC_ALLOWED_GROUPS: csvFrom,
	OIDC_ADMIN_GROUPS: csvFrom,
	OIDC_ALLOWED_EMAILS: csvFrom,
	OIDC_JIT_PROVISION: boolFrom(true),
	OIDC_LINK_BY_EMAIL: boolFrom(true),
	OIDC_SYNC_ROLES: boolFrom(true),
	OIDC_SYNC_PROFILE: boolFrom(true),
	OIDC_RP_LOGOUT: boolFrom(true)
});

/** Every variable the schema reads — `.env.example` and docs/dev/04 §4.5 list each one. */
export const configKeys = Object.keys(RawSchema.entries);
