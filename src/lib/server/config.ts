import * as v from 'valibot';
import { dirname, join } from 'node:path';
import * as env from '$app/env/private';
import { RawSchema } from './config-schema';
import { readImmichConfig } from './immich/config';
import { readNextcloudConfig } from './nextcloud/config';

/**
 * Central, validated runtime configuration. Parsed once at startup.
 * See docs/dev/04-architecture.md §4.5 and docs/dev/07-deployment.md.
 */

export { configKeys } from './config-schema';

const MIN_SESSION_SECRET_LENGTH = 32;

/** Refuses the dev default, a docs placeholder (`change-me…`) and anything short; throws at start. */
export function assertProductionSessionSecret(secret: string): void {
	if (secret.length < MIN_SESSION_SECRET_LENGTH || /change-?me/i.test(secret)) {
		throw new Error(
			`Configuration error: SESSION_SECRET must be a real secret of at least ${MIN_SESSION_SECRET_LENGTH} characters in production (generate one with \`openssl rand -hex 32\`).`
		);
	}
}

function build() {
	const raw = v.parse(RawSchema, { ...env });

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
	if (isProd) assertProductionSessionSecret(raw.SESSION_SECRET);

	return {
		url: raw.STELLA_URL.replace(/\/$/, ''),
		databasePath: raw.DATABASE_PATH,
		mediaDir: raw.MEDIA_DIR,
		// Uploaded dumps wait here between the wizard's preview and confirm steps (docs/dev/02 §2.16).
		importDir: join(dirname(raw.DATABASE_PATH), 'import'),
		sessionSecret: raw.SESSION_SECRET,
		isProd,
		seedDemo: raw.SEED_DEMO,
		logFormat: raw.LOG_FORMAT,
		debugPages: raw.DEBUG_PAGES,
		updateCheck: raw.UPDATE_CHECK,
		updateFeedUrl: raw.UPDATE_FEED_URL,
		immich: readImmichConfig(raw),
		nextcloud: readNextcloudConfig(raw),
		auth: {
			local: raw.AUTH_LOCAL_ENABLED,
			oidc: raw.AUTH_OIDC_ENABLED
		},
		oidc: {
			issuer: raw.OIDC_ISSUER.replace(/\/$/, ''),
			clientId: raw.OIDC_CLIENT_ID,
			clientSecret: raw.OIDC_CLIENT_SECRET,
			redirectUri:
				raw.OIDC_REDIRECT_URI || `${raw.STELLA_URL.replace(/\/$/, '')}/login/sso/callback`,
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
