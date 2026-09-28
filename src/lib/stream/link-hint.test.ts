import { describe, expect, it } from 'bun:test';
import { LINK_PARAM, linkHintHref } from './link-hint';

/*
 * After a moment naming two people, the stream offers to link them (docs/02 §2.22.1): the
 * composer goes back to Home with the pair in the URL, and Home's load reads it from there.
 */

describe('linkHintHref', () => {
	it('carries the first two people of a moment to the stream', () => {
		expect(linkHintHref(['julia', 'marco'])).toBe(`/?${LINK_PARAM}=julia,marco`);
	});

	it('is the plain stream when there is nobody to link', () => {
		expect(linkHintHref(null)).toBe('/');
	});
});
