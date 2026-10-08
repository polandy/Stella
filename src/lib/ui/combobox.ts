/*
 * Filtering a short list of existing values for a free-text field that suggests them without
 * requiring a pick (docs/05 — a role field offers a circle's roles; typing a new one is fine).
 */

/** `options` matching `query`, values that start with it first; everything on an empty query. */
export function filterSuggestions(query: string, options: readonly string[]): string[] {
	const q = query.trim().toLowerCase();
	if (q === '') return [...options];
	return options
		.filter((o) => o.toLowerCase().includes(q))
		.sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)));
}
