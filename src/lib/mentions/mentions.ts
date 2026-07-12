/*
 * Shared @-mention parser/resolver for notes and journal (docs/02 §2.20.1).
 *
 * Pure and framework-agnostic — no DB, no SvelteKit. The stored form of a mention is a stable,
 * id-based token `@{contact:<id>}`, so it survives a rename and never resolves to the wrong
 * person when two people share a name. Typed `@FirstnameLastname` handles are only a lookup key,
 * resolved to that token at save time via a caller-supplied resolver (the edge builds it from
 * the contacts visible to the entry's audience, keeping the visibility rule out of here).
 */

/** Canonical, id-based mention token as stored in an entry/note body. */
export const MENTION_TOKEN_RE = /@\{contact:([A-Za-z0-9_-]+)\}/g;

/**
 * Matches, in one pass: an escaped `\@` (kept literal), a canonical token, or a typed handle.
 * The handle's `@` must sit at a boundary — the negative lookbehind rejects a letter/number
 * (so `anna@example.com` is not a mention), another `@`, and a backslash (the escape case).
 */
const TOKEN_OR_HANDLE = /(\\@)|@\{contact:([A-Za-z0-9_-]+)\}|(?<![\p{L}\p{N}@\\])@(\p{L}[\p{L}\p{N}]*)/gu;

/** Normalise a name or typed handle to a comparison key: lowercase letters/numbers only. */
export function mentionKey(name: string): string {
	return name.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export interface MentionCandidate {
	id: string;
	firstName?: string | null;
	lastName?: string | null;
	displayName: string;
}

/**
 * Build a resolver from the contacts a mention is allowed to reference. A handle maps to a
 * contact id only when exactly one contact has that first+last (falling back to display name)
 * key; a collision is ambiguous and resolves to null, so the mention stays literal text.
 */
export function createHandleResolver(contacts: MentionCandidate[]): (handle: string) => string | null {
	const byKey = new Map<string, string | null>(); // key -> id, or null once ambiguous
	const add = (raw: string, id: string) => {
		const key = mentionKey(raw);
		if (!key) return;
		if (!byKey.has(key)) byKey.set(key, id);
		else if (byKey.get(key) !== id) byKey.set(key, null); // two contacts share the handle
	};
	for (const c of contacts) {
		// Index both `@FirstnameLastname` and the display name, so a handle matches whether the
		// display name is a nickname or a hyphenated/married form that differs from first+last.
		if (c.firstName || c.lastName) add(`${c.firstName ?? ''}${c.lastName ?? ''}`, c.id);
		add(c.displayName, c.id);
	}
	return (handle: string) => byKey.get(mentionKey(handle)) ?? null;
}

/**
 * Normalise a body's mentions for storage: resolve typed handles to canonical tokens where the
 * resolver finds a unique match, leave unknown/ambiguous handles and escaped `\@` as literal
 * text, and pass existing canonical tokens through. Returns the rewritten body plus the unique
 * referenced contact ids (in first-seen order) for persisting the mention links.
 */
export function resolveMentions(
	body: string,
	resolve: (handle: string) => string | null
): { body: string; ids: string[] } {
	const ids: string[] = [];
	const pushId = (id: string) => {
		if (!ids.includes(id)) ids.push(id);
	};
	const out = body.replace(TOKEN_OR_HANDLE, (match, escaped, tokenId, handle) => {
		if (escaped) return match; // '\@' stays escaped and idempotent
		if (tokenId) {
			pushId(tokenId);
			return match; // already canonical
		}
		const id = resolve(handle);
		if (id) {
			pushId(id);
			return `@{contact:${id}}`;
		}
		return match; // unresolved handle → literal text
	});
	return { body: out, ids };
}

/** Unique contact ids referenced by the canonical tokens already in a body (in order). */
export function extractMentionIds(body: string): string[] {
	const ids: string[] = [];
	for (const m of body.matchAll(MENTION_TOKEN_RE)) {
		if (!ids.includes(m[1])) ids.push(m[1]);
	}
	return ids;
}

export type MentionSegment = { type: 'text'; value: string } | { type: 'mention'; id: string };

/**
 * Split a body into alternating text and mention segments so a renderer can build chips without
 * re-implementing the token grammar. Operates on canonical tokens only.
 */
export function segmentMentions(body: string): MentionSegment[] {
	const segments: MentionSegment[] = [];
	let last = 0;
	for (const m of body.matchAll(MENTION_TOKEN_RE)) {
		const start = m.index ?? 0;
		if (start > last) segments.push({ type: 'text', value: body.slice(last, start) });
		segments.push({ type: 'mention', id: m[1] });
		last = start + m[0].length;
	}
	if (last < body.length) segments.push({ type: 'text', value: body.slice(last) });
	return segments;
}
