import { mentionKey, type MentionCandidate } from './mentions';

/*
 * Pure helpers behind the @-mention picker in the moment composer (docs/02 §2.22.1). Kept out
 * of the Svelte component so the caret/handle logic is unit-testable: find the handle being
 * typed at the caret, rank candidates for it, and splice the chosen handle back into the text.
 */

/** Max suggestions the picker shows. */
export const PICKER_LIMIT = 5;

/** A handle is `@` + letters/digits. The `@` must sit at a boundary (docs/02 §2.20.1). */
const HANDLE_AT_CARET = /(?<![\p{L}\p{N}@\\])@([\p{L}\p{N}]*)$/u;

export interface ActiveHandle {
	/** Index of the `@`. */
	start: number;
	/** Text typed after the `@` (may be empty right after typing `@`). */
	query: string;
}

/** The handle currently being typed, i.e. ending exactly at the caret, or null. */
export function activeHandle(text: string, caret: number): ActiveHandle | null {
	const m = HANDLE_AT_CARET.exec(text.slice(0, caret));
	if (!m) return null;
	return { start: caret - m[0].length, query: m[1] };
}

/** The `@FirstnameLastname` form for a person, falling back to their display name. */
export function handleFor(c: MentionCandidate): string {
	const raw = c.firstName || c.lastName ? `${c.firstName ?? ''}${c.lastName ?? ''}` : c.displayName;
	return '@' + raw.normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');
}

export interface Suggestions<C extends MentionCandidate> {
	people: C[];
	/** Name to offer as "Create …", or null when the query is empty or already someone. */
	create: string | null;
}

/**
 * Rank people for a query: prefix matches on any name part first, then substring matches,
 * each alphabetically. Offers creation when nothing matches the query exactly.
 */
export function suggest<C extends MentionCandidate>(
	query: string,
	candidates: C[],
	limit = PICKER_LIMIT
): Suggestions<C> {
	const q = mentionKey(query);
	const parts = (c: C) =>
		[c.displayName, c.firstName ?? '', c.lastName ?? '']
			.map(mentionKey)
			.filter((p) => p.length > 0);
	const scored = candidates
		.map((c) => {
			const ps = parts(c);
			const full = mentionKey(`${c.firstName ?? ''}${c.lastName ?? ''}`);
			const rank = !q
				? 1
				: ps.some((p) => p.startsWith(q)) || full.startsWith(q)
					? 0
					: ps.some((p) => p.includes(q))
						? 1
						: -1;
			return { c, rank };
		})
		.filter((s) => s.rank >= 0)
		.sort((a, b) => a.rank - b.rank || a.c.displayName.localeCompare(b.c.displayName));
	const people = scored.slice(0, limit).map((s) => s.c);
	const exact = candidates.some((c) => {
		const full = mentionKey(`${c.firstName ?? ''}${c.lastName ?? ''}`);
		return mentionKey(c.displayName) === q || (full.length > 0 && full === q);
	});
	return { people, create: q && !exact ? query : null };
}

/** Replace the active handle with `handle` plus a trailing space; returns the new text and caret. */
export function insertHandle(
	text: string,
	active: ActiveHandle,
	caret: number,
	handle: string
): { text: string; caret: number } {
	const inserted = handle + ' ';
	return {
		text: text.slice(0, active.start) + inserted + text.slice(caret),
		caret: active.start + inserted.length
	};
}
