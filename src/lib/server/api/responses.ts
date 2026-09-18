import { json } from '@sveltejs/kit';

/*
 * What the API answers when it cannot get as far as the request (docs/02 §2.16.1). Bodies carry
 * a `code` a program can branch on; the API has no reader to put a sentence in front of.
 */

/** No token, or one that is unknown, withdrawn or past its day. */
export function unauthorized(): Response {
	return json(
		{ error: { code: 'unauthorized' } },
		{ status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
	);
}

/** The request itself is malformed — not JSON, or a query parameter out of range. */
export function badRequest(code: 'invalidJson' | 'invalidDryRun'): Response {
	return json({ error: { code } }, { status: 400 });
}
