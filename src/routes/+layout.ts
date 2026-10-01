import { loadCatalog } from '$lib/i18n/translate';
import type { LayoutLoad } from './$types';

/*
 * Only English ships with every page; another language's catalogue is a chunk of its own
 * (docs/04 §4.4). Awaiting it here — in the universal root load, which the browser runs
 * before it hydrates and before it renders any navigation — means no component ever
 * translates in a language that has not arrived: the first paint is the server's German,
 * hydration finds the same German, and a change of language swaps the copy only once the
 * new catalogue is in. On the server the catalogue is already loaded (`init`), so this
 * resolves at once.
 */
export const load: LayoutLoad = async ({ data }) => {
	await loadCatalog(data.locale);
	return data;
};
