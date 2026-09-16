import { describe, expect, it } from 'bun:test';
import { returnedTo, reviewHref, reviewIsOpen, reviewLocationFrom, reviewQuery } from './review-url';

/*
 * The review's query string (docs/concepts/relationship-review-at-scale.html).
 *
 * Every fold is a link, so this *is* the interface between the pager, the search and the log.
 * Two things break quietly if it is wrong: a link that drops `review` closes the pass and shows
 * the idle screen, and a redirect that keeps SvelteKit's `/action` parameter sends the member
 * somewhere that is not a page of the review at all.
 */

describe('reviewHref', () => {
	it('keeps the pass open with no other place to be', () => {
		expect(reviewHref()).toBe('/settings/relationships?review');
	});

	it('carries the search and the cursor', () => {
		expect(reviewHref({ query: 'Ammann', after: 'Nadja Ammann|01J' })).toBe(
			'/settings/relationships?review&q=Ammann&after=Nadja+Ammann%7C01J'
		);
	});

	/* One cursor at a time: a page is either walking forward or walking back, never both. */
	it('prefers the forward cursor when handed both', () => {
		expect(reviewHref({ after: 'a', before: 'b' })).toBe('/settings/relationships?review&after=a');
	});

	it('addresses the declined log', () => {
		expect(reviewHref({ declined: true })).toBe('/settings/relationships?review&declined');
	});
});

describe('reviewLocationFrom', () => {
	it('reads a place back out of a URL', () => {
		const at = reviewLocationFrom(new URL(`http://x${reviewHref({ query: 'Roth', after: 'k' })}`).searchParams);
		expect(at).toEqual({ query: 'Roth', after: 'k', before: null, declined: false });
	});

	/*
	 * A form posts to the current URL with SvelteKit's action name attached as an empty
	 * parameter. Round-tripping through here is what keeps `?/dismissSuggestion` out of the
	 * redirect the member follows afterwards.
	 */
	it('drops the form action a POST arrives with', () => {
		const posted = new URL('http://x/settings/relationships?review&after=k&/dismissSuggestion');
		expect(reviewHref(reviewLocationFrom(posted.searchParams))).toBe(
			'/settings/relationships?review&after=k'
		);
	});

	it('knows whether the pass was asked for at all', () => {
		expect(reviewIsOpen(new URL('http://x/settings/relationships').searchParams)).toBe(false);
		expect(reviewIsOpen(new URL('http://x/settings/relationships?review').searchParams)).toBe(true);
	});
});

describe('the place an answer returns to', () => {
	/*
	 * The round trip that keeps a member's place. A form action resolves against the current
	 * URL, so the search and the cursor cannot ride along on it — they travel in the body and
	 * come back through here.
	 */
	it('carries a page and a search through a form and back', () => {
		const at = { query: 'Ammann', after: 'Nadja Ammann|01J' };
		expect(returnedTo(reviewQuery(at))).toBe(reviewHref(at));
	});

	/* A form that carried nothing still lands on the review rather than on nothing. */
	it('falls back to the top of the list', () => {
		expect(returnedTo(null)).toBe('/settings/relationships?review');
		expect(returnedTo('')).toBe('/settings/relationships?review');
	});

	/*
	 * The field is a hidden input, so it is whatever the browser sends. The redirect is built
	 * from `reviewHref`, which writes the path itself — so a tampered value can move the reader
	 * around inside the review and nowhere else.
	 */
	it('cannot be steered off this screen', () => {
		expect(returnedTo('q=x&after=y&evil=https://elsewhere.example')).toBe(
			'/settings/relationships?review&q=x&after=y'
		);
		expect(returnedTo('https://elsewhere.example')).toBe('/settings/relationships?review');
	});
});
