/*
 * Tags on a page's data, so a device holding a copy can ask whether it changed and be told
 * "no" in a few bytes (docs/concepts/offline-reading.md §4.2). The tag is a hash of exactly
 * what this member was sent: whatever changed a page — a deletion, a relative's new name, a
 * visibility — changed its bytes, so no list of tables has to be kept in step with the page.
 */

const DATA_SUFFIX = '/__data.json';

/** A strong tag of `body`, quoted as HTTP expects. */
export function etagOf(body: Uint8Array): string {
	return `"${Bun.hash(body).toString(36)}"`;
}

/** Whether `If-None-Match` names `etag`: the device already holds exactly this. */
export function isUnchanged(ifNoneMatch: string | null, etag: string): boolean {
	if (!ifNoneMatch) return false;
	// Weak comparison (RFC 9110 §13.1.2): a `W/` prefix does not make a different tag.
	return ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

/**
 * Whether a response gets a tag: a page's data, answered whole. Streamed data (promises in a
 * `load`) has no whole body to hash, and an error is not worth keeping.
 */
export function wantsEtag(answer: { method: string; pathname: string; status: number; contentType: string | null }): boolean {
	return (
		answer.method === 'GET' &&
		answer.pathname.endsWith(DATA_SUFFIX) &&
		answer.status === 200 &&
		(answer.contentType ?? '').startsWith('application/json')
	);
}
