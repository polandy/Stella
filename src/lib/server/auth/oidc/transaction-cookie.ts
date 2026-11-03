import { createHmac, timingSafeEqual } from 'node:crypto';

/*
 * The OIDC transaction (state / nonce / PKCE verifier) travels between the redirect to the
 * provider and the callback in a cookie; the callback trusts it to bind the answer to the
 * browser that started the sign-in. httpOnly keeps scripts from reading it, but anything able
 * to *set* a cookie for the host (a sibling subdomain — cookie tossing) could plant its own
 * values and log the visitor into the planter's account. So the value is sealed:
 * `payload.mac`, the payload the transaction as JSON in base64url, the MAC an HMAC-SHA256 over
 * it with `SESSION_SECRET`, bound to this one purpose so no other signed value of Stella's
 * can stand in for it (docs/04 §4.4).
 */

export interface OidcTransaction {
	state: string;
	nonce: string;
	codeVerifier: string;
}

const PURPOSE = 'stella:oidc-transaction:';
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const macOf = (payload: string, secret: string) =>
	createHmac('sha256', secret)
		.update(PURPOSE + payload)
		.digest();

export function sealOidcTransaction(tx: OidcTransaction, secret: string): string {
	const payload = Buffer.from(JSON.stringify(tx)).toString('base64url');
	return `${payload}.${macOf(payload, secret).toString('base64url')}`;
}

/** The transaction, or null for anything not sealed by this server or not a transaction. */
export function openOidcTransaction(raw: string, secret: string): OidcTransaction | null {
	const parts = raw.split('.');
	if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return null;
	const [payload, mac] = parts;

	const given = Buffer.from(mac, 'base64url');
	const expected = macOf(payload, secret);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

	let body: unknown;
	try {
		body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	return isTransaction(body) ? body : null;
}

function isTransaction(body: unknown): body is OidcTransaction {
	if (typeof body !== 'object' || body === null) return false;
	const { state, nonce, codeVerifier } = body as Record<string, unknown>;
	return typeof state === 'string' && typeof nonce === 'string' && typeof codeVerifier === 'string';
}
