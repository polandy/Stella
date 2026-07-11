/*
 * Turn free user input into a safe FTS5 MATCH expression (docs/02 §2.9). Each word becomes
 * a prefix match; non-alphanumeric characters are dropped and everything is lowercased, so
 * FTS syntax and the uppercase operator keywords (AND/OR/NOT) can never leak through.
 */

export function toFtsQuery(input: string): string {
	const tokens = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	return tokens.map((token) => `${token}*`).join(' ');
}
