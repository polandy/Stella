import { describe, expect, it } from 'bun:test';
import { MAX_STREAM_PAGES, nextPagesHref, offersMorePages, streamPagesOf } from './pages';

const pagesOf = (query: string) => streamPagesOf(new URLSearchParams(query));

describe('streamPagesOf', () => {
	it('reads one page without the parameter', () => {
		expect(pagesOf('')).toBe(1);
	});

	it('reads the count the address asks for', () => {
		expect(pagesOf('pages=3')).toBe(3);
	});

	it('takes anything that is not a whole number as one page', () => {
		for (const raw of ['0', '-2', '1.5', 'abc', '', '2e3']) expect(pagesOf(`pages=${raw}`)).toBe(1);
	});

	it('caps a hand-edited count', () => {
		expect(pagesOf('pages=9999')).toBe(MAX_STREAM_PAGES);
	});
});

describe('offersMorePages', () => {
	it('offers another page while the stream holds more', () => {
		expect(offersMorePages(1, true)).toBe(true);
		expect(offersMorePages(1, false)).toBe(false);
	});

	it('stops at the cap even when more is left', () => {
		expect(offersMorePages(MAX_STREAM_PAGES, true)).toBe(false);
	});
});

describe('nextPagesHref', () => {
	it('counts one page more and keeps the filter', () => {
		const url = new URL('http://x/?kind=moment&tag=walk&tag=lake&pages=2');
		expect(nextPagesHref(url, 2)).toBe('/?kind=moment&tag=walk&tag=lake&pages=3');
	});

	it('adds the count to a plain Home', () => {
		expect(nextPagesHref(new URL('http://x/'), 1)).toBe('/?pages=2');
	});
});
