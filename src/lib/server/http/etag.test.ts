import { describe, expect, it } from 'bun:test';
import { etagOf, isUnchanged, wantsEtag } from './etag';

/*
 * A page's data carries a tag of its content, so a device holding a copy can ask "has this
 * changed?" and be told "no" in a few bytes (docs/concepts/offline-reading.md §4.2). The tag is
 * of what this member was sent, so a deletion, a relative's new name or a visibility change all
 * move it — nothing has to be listed.
 */

const bytes = (text: string) => new TextEncoder().encode(text);

describe('etagOf', () => {
	it('is the same for the same content and different for different content', () => {
		expect(etagOf(bytes('{"a":1}'))).toBe(etagOf(bytes('{"a":1}')));
		expect(etagOf(bytes('{"a":1}'))).not.toBe(etagOf(bytes('{"a":2}')));
	});

	it('is a strong tag in the quoted form HTTP expects', () => {
		expect(etagOf(bytes('{}'))).toMatch(/^"[0-9a-z]+"$/);
	});
});

describe('isUnchanged', () => {
	const tag = etagOf(bytes('{"a":1}'));

	it('is true when the device already holds this tag, alone or among others', () => {
		expect(isUnchanged(tag, tag)).toBe(true);
		expect(isUnchanged(`"other", ${tag}`, tag)).toBe(true);
		expect(isUnchanged(`W/${tag}`, tag)).toBe(true);
	});

	it('is false when the device holds another tag, or none', () => {
		expect(isUnchanged('"other"', tag)).toBe(false);
		expect(isUnchanged(null, tag)).toBe(false);
		expect(isUnchanged('', tag)).toBe(false);
	});
});

describe('wantsEtag', () => {
	it('tags a page’s data answered in full', () => {
		expect(
			wantsEtag({
				method: 'GET',
				pathname: '/contacts/abc/__data.json',
				status: 200,
				contentType: 'application/json'
			})
		).toBe(true);
	});

	it('leaves everything else alone: pages, other requests, errors and streamed data', () => {
		const data = {
			method: 'GET',
			pathname: '/contacts/abc/__data.json',
			status: 200,
			contentType: 'application/json'
		};
		expect(wantsEtag({ ...data, pathname: '/contacts/abc' })).toBe(false);
		expect(wantsEtag({ ...data, method: 'POST' })).toBe(false);
		expect(wantsEtag({ ...data, status: 404 })).toBe(false);
		// Data with promises in it streams as it resolves; there is no whole body to tag.
		expect(wantsEtag({ ...data, contentType: 'text/sveltekit-data' })).toBe(false);
	});
});
