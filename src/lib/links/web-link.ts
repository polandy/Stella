/*
 * A web address a record links to (docs/dev/02 §2.25, §2.27): a gift's shop page, an outing's
 * booking page. Pure and client-safe, so the form, the payload schemas and the use-cases read one rule.
 */

/** A link as a form gave it: a web address, none, or something that is not one. */
export type WebLink = { ok: true; url: string | null } | { ok: false };

const WEB_SCHEME = /^https?:\/\//i;
/** Any scheme at all (`javascript:`, `mailto:`, …) — refused unless it is the web's. */
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The link a record may carry. Only a web address is kept, because the card renders it as a link
 * and a `javascript:` one would run when tapped. An address pasted without its scheme —
 * `shop.example/teapot` — is read as `https://`.
 */
export function webLink(raw: string): WebLink {
	const text = raw.trim();
	if (text.length === 0) return { ok: true, url: null };
	if (/\s/.test(text)) return { ok: false };
	const candidate = WEB_SCHEME.test(text) ? text : ANY_SCHEME.test(text) ? null : `https://${text}`;
	if (candidate === null) return { ok: false };
	try {
		const parsed = new URL(candidate);
		if (parsed.hostname.length === 0) return { ok: false };
	} catch {
		// `new URL` throws on what is not an address; that is the answer, not a failure.
		return { ok: false };
	}
	return { ok: true, url: candidate };
}
