/*
 * The Immich settings (docs/04 §4.5, docs/07): pure, so the both-or-neither rule
 * is tested without an environment. `config.ts` hands the raw variables over; this decides.
 * Without `IMMICH_URL` the feature appears nowhere.
 */

/** Where the demo's links point; nothing answers there, and nothing needs to. */
export const DEMO_PUBLIC_URL = 'https://immich.example.com';

/** How Stella reaches Immich, once configured. */
export type ImmichConfig =
	| {
			mode: 'http';
			/** How the server reaches Immich — ideally its internal container address. */
			url: string;
			/** What links for the browser point at. */
			publicUrl: string;
			/** Never logged, never sent to a browser (docs/04 ADR-102). */
			apiKey: string;
	  }
	/** The in-memory stand-in (`fake-gateway.ts`), for the demo and e2e server only. */
	| { mode: 'demo'; publicUrl: string };

export interface RawImmichSettings {
	IMMICH_URL: string;
	IMMICH_PUBLIC_URL: string;
	IMMICH_API_KEY: string;
	IMMICH_DEMO: boolean;
	SEED_DEMO: boolean;
}

/** A web address with the trailing slash dropped; throws naming the variable, never its value. */
function webAddress(variable: string, raw: string): string {
	let protocol = '';
	try {
		protocol = new URL(raw).protocol;
	} catch {
		// Reported below, with the same message as a wrong scheme.
	}
	if (protocol !== 'http:' && protocol !== 'https:') {
		throw new Error(`Configuration error: ${variable} must be an http:// or https:// address.`);
	}
	return raw.replace(/\/+$/, '');
}

/** The Immich settings, null when the feature is off. Throws on a half-made configuration. */
export function readImmichConfig(raw: RawImmichSettings): ImmichConfig | null {
	const url = raw.IMMICH_URL.trim();
	const apiKey = raw.IMMICH_API_KEY.trim();
	const publicUrl = raw.IMMICH_PUBLIC_URL.trim();

	if (raw.IMMICH_DEMO) {
		if (!raw.SEED_DEMO) {
			throw new Error(
				'Configuration error: IMMICH_DEMO=true is for the demo household and needs SEED_DEMO=true.'
			);
		}
		if (url || apiKey) {
			throw new Error(
				'Configuration error: IMMICH_DEMO=true cannot be combined with IMMICH_URL or IMMICH_API_KEY.'
			);
		}
		return {
			mode: 'demo',
			publicUrl: publicUrl ? webAddress('IMMICH_PUBLIC_URL', publicUrl) : DEMO_PUBLIC_URL
		};
	}

	if (!url && !apiKey) return null;
	if (!url || !apiKey) {
		throw new Error(
			'Configuration error: IMMICH_URL and IMMICH_API_KEY are set together or not at all.'
		);
	}
	const base = webAddress('IMMICH_URL', url);
	return {
		mode: 'http',
		url: base,
		publicUrl: publicUrl ? webAddress('IMMICH_PUBLIC_URL', publicUrl) : base,
		apiKey
	};
}
