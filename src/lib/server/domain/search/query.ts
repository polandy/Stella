import { hashtagAt, tagKey } from '../../../hashtags/hashtags';

/*
 * Turn free user input into a safe FTS5 MATCH expression (docs/02 §2.9). Each word becomes
 * a prefix match; non-alphanumeric characters are dropped and everything is lowercased, so
 * FTS syntax and the uppercase operator keywords (AND/OR/NOT) can never leak through.
 */

export function toFtsQuery(input: string): string {
	const tokens = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	return tokens.map((token) => `${token}*`).join(' ');
}

/** The key of the tag when the whole input is one `#tag`, else null (docs/02 §2.20.2). */
export function searchedTag(input: string): string | null {
	const text = input.trim();
	const tag = hashtagAt(text, 0);
	return tag && tag.end === text.length ? tagKey(tag.name) : null;
}
