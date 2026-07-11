import * as v from 'valibot';
import { env } from '$env/dynamic/private';

/**
 * Central, validated runtime configuration. Parsed once at startup.
 * See docs/04-architecture.md §4.5 and docs/07-deployment.md.
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

const RawSchema = v.object({
	STELLA_URL: v.optional(v.string(), 'http://localhost:5173'),
	DATABASE_PATH: v.optional(v.string(), './data/stella.db'),
	MEDIA_DIR: v.optional(v.string(), './data/media'),
	SESSION_SECRET: v.optional(v.string(), 'dev-insecure-secret-change-me'),

	AUTH_LOCAL_ENABLED: boolFrom(true),
	AUTH_OIDC_ENABLED: boolFrom(false),

	// Populate the database with the demo dataset on startup (test phase only). Idempotent.
	SEED_DEMO: boolFrom(false),

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

function build() {
	const raw = v.parse(RawSchema, env);

	if (!raw.AUTH_LOCAL_ENABLED && !raw.AUTH_OIDC_ENABLED) {
		throw new Error(
			'Configuration error: both AUTH_LOCAL_ENABLED and AUTH_OIDC_ENABLED are false — no way to sign in.'
		);
	}
	if (raw.AUTH_OIDC_ENABLED && (!raw.OIDC_ISSUER || !raw.OIDC_CLIENT_ID)) {
		throw new Error(
			'Configuration error: AUTH_OIDC_ENABLED=true requires OIDC_ISSUER and OIDC_CLIENT_ID.'
		);
	}

	const isProd = process.env.NODE_ENV === 'production';
	if (isProd && raw.SESSION_SECRET === 'dev-insecure-secret-change-me') {
		throw new Error('Configuration error: SESSION_SECRET must be set in production.');
	}

	return {
		url: raw.STELLA_URL.replace(/\/$/, ''),
		databasePath: raw.DATABASE_PATH,
		mediaDir: raw.MEDIA_DIR,
		sessionSecret: raw.SESSION_SECRET,
		isProd,
		seedDemo: raw.SEED_DEMO,
		auth: {
			local: raw.AUTH_LOCAL_ENABLED,
			oidc: raw.AUTH_OIDC_ENABLED
		},
		oidc: {
			issuer: raw.OIDC_ISSUER.replace(/\/$/, ''),
			clientId: raw.OIDC_CLIENT_ID,
			clientSecret: raw.OIDC_CLIENT_SECRET,
			redirectUri: raw.OIDC_REDIRECT_URI || `${raw.STELLA_URL.replace(/\/$/, '')}/login/sso/callback`,
			scopes: raw.OIDC_SCOPES,
			providerName: raw.OIDC_PROVIDER_NAME,
			allowedGroups: raw.OIDC_ALLOWED_GROUPS,
			adminGroups: raw.OIDC_ADMIN_GROUPS,
			allowedEmails: raw.OIDC_ALLOWED_EMAILS,
			jitProvision: raw.OIDC_JIT_PROVISION,
			linkByEmail: raw.OIDC_LINK_BY_EMAIL,
			syncRoles: raw.OIDC_SYNC_ROLES,
			syncProfile: raw.OIDC_SYNC_PROFILE,
			rpLogout: raw.OIDC_RP_LOGOUT
		}
	} as const;
}

export type Config = ReturnType<typeof build>;

/*
 * Lazy, memoized config. Built on first access at runtime — never at import time — so the
 * SvelteKit build's route analysis (which imports server modules under NODE_ENV=production)
 * does not trigger the production validation. Fails loud on the first real access if
 * misconfigured.
 */
let cached: Config | null = null;
export function getConfig(): Config {
	return (cached ??= build());
}
