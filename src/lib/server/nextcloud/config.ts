import type { NextcloudSource } from '../../import-match/card';

/*
 * The Nextcloud link's settings (docs/02 §2.16.3, docs/07): pure, so the all-or-nothing rule is
 * tested without an environment. `config.ts` hands the raw variables over; this decides.
 * Without `NEXTCLOUD_ADDRESS_BOOK_URL` the link appears nowhere. The app password lives in the
 * environment only — never in the database, so never in the archive either.
 */

/** How Stella reaches the household's address book, once configured. */
export type NextcloudConfig =
	| {
			mode: 'http';
			/** The address book's CardDAV collection, ending in a slash. */
			url: string;
			user: string;
			/** Never logged, never sent to a browser. */
			appPassword: string;
			source: NextcloudSource;
	  }
	/** The in-memory stand-in (`fake-gateway.ts`), for the demo and e2e server only. */
	| { mode: 'demo'; source: NextcloudSource };

export interface RawNextcloudSettings {
	NEXTCLOUD_ADDRESS_BOOK_URL: string;
	NEXTCLOUD_USER: string;
	NEXTCLOUD_APP_PASSWORD: string;
	NEXTCLOUD_DEMO: boolean;
	SEED_DEMO: boolean;
}

/** The demo book's name, the one a default Nextcloud gives every user. */
const DEMO_SOURCE: NextcloudSource = 'nextcloud:contacts';

/** The collection's address with exactly one trailing slash; throws naming the variable only. */
function collectionAddress(raw: string): string {
	let protocol = '';
	try {
		protocol = new URL(raw).protocol;
	} catch {
		// Reported below, with the same message as a wrong scheme.
	}
	if (protocol !== 'http:' && protocol !== 'https:') {
		throw new Error(
			'Configuration error: NEXTCLOUD_ADDRESS_BOOK_URL must be an http:// or https:// address.'
		);
	}
	return raw.replace(/\/+$/, '') + '/';
}

/** The source a link's answers are kept under: the book's last path segment. */
function sourceOf(url: string): NextcloudSource {
	const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
	return `nextcloud:${name || 'contacts'}`;
}

/** The Nextcloud settings, null when the link is off. Throws on a half-made configuration. */
export function readNextcloudConfig(raw: RawNextcloudSettings): NextcloudConfig | null {
	const url = raw.NEXTCLOUD_ADDRESS_BOOK_URL.trim();
	const user = raw.NEXTCLOUD_USER.trim();
	const appPassword = raw.NEXTCLOUD_APP_PASSWORD.trim();

	if (raw.NEXTCLOUD_DEMO) {
		if (!raw.SEED_DEMO) {
			throw new Error(
				'Configuration error: NEXTCLOUD_DEMO=true is for the demo household and needs SEED_DEMO=true.'
			);
		}
		if (url || user || appPassword) {
			throw new Error(
				'Configuration error: NEXTCLOUD_DEMO=true cannot be combined with a real Nextcloud address book.'
			);
		}
		return { mode: 'demo', source: DEMO_SOURCE };
	}

	if (!url && !user && !appPassword) return null;
	if (!url || !user || !appPassword) {
		throw new Error(
			'Configuration error: NEXTCLOUD_ADDRESS_BOOK_URL, NEXTCLOUD_USER and NEXTCLOUD_APP_PASSWORD are set together or not at all.'
		);
	}
	const base = collectionAddress(url);
	return { mode: 'http', url: base, user, appPassword, source: sourceOf(base) };
}
