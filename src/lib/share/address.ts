import type { ShareParts } from './shared';

/*
 * A share that reached Stella's server rather than the service worker (docs/02 §2.18.3): the
 * app opened before its worker took over. The server cannot hold it for the sheet, so it hands
 * the words back in the sheet's address; photos cannot ride along there, and the sheet says so.
 */

const FIELDS = ['title', 'text', 'url'] as const;

/** The sheet's address for what came, empty fields left out. */
export function sheetAddressFor(parts: ShareParts): string {
	const search = new URLSearchParams();
	for (const field of FIELDS) if (parts[field]) search.set(field, parts[field]);
	if (parts.photoCount > 0) search.set('photos', 'left');
	const query = search.toString();
	return query ? `/share?${query}` : '/share';
}

/** What the sheet's address carries, as `sheetAddressFor` wrote it. */
export function partsFromAddress(search: URLSearchParams): {
	parts: ShareParts;
	photosLeftBehind: boolean;
} {
	return {
		parts: {
			title: search.get('title') ?? '',
			text: search.get('text') ?? '',
			url: search.get('url') ?? '',
			photoCount: 0
		},
		photosLeftBehind: search.get('photos') === 'left'
	};
}
