/*
 * How far down the household stream Home has read (docs/dev/02 §2.22.2), carried in the URL as a
 * page count, so a reload or the back button draws the same rows and the browser can put the
 * reader back where they were.
 */

/** Query parameter carrying how many pages Home shows: `?pages=3`. */
export const STREAM_PAGES_PARAM = 'pages';

/** The most pages one address asks for; past it the stream ends, so a hand-edited link stays cheap. */
export const MAX_STREAM_PAGES = 25;

/** The page count `params` asks for: a whole number from 1 to `MAX_STREAM_PAGES`, 1 otherwise. */
export function streamPagesOf(params: URLSearchParams): number {
	const raw = params.get(STREAM_PAGES_PARAM) ?? '';
	const pages = /^\d+$/.test(raw) ? Number(raw) : 1;
	return Math.min(Math.max(pages, 1), MAX_STREAM_PAGES);
}

/** Whether another page may be asked for: the stream holds more and the cap is not reached. */
export function offersMorePages(pages: number, more: boolean): boolean {
	return more && pages < MAX_STREAM_PAGES;
}

/** The address of `url` showing one page more, every other parameter kept. */
export function nextPagesHref(url: Pick<URL, 'pathname' | 'search'>, pages: number): string {
	const params = new URLSearchParams(url.search);
	params.set(STREAM_PAGES_PARAM, String(pages + 1));
	return `${url.pathname}?${params}`;
}
