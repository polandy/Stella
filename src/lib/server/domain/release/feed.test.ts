import { describe, expect, it } from 'bun:test';
import { readLatestRelease, webUrlOrNull } from './feed';

describe('readLatestRelease', () => {
	it('reads the tag and the release page out of a GitHub answer', () => {
		expect(
			readLatestRelease({
				tag_name: 'v0.0.11',
				html_url: 'https://github.com/polandy/Stella/releases/tag/v0.0.11'
			})
		).toEqual({ tag: 'v0.0.11', url: 'https://github.com/polandy/Stella/releases/tag/v0.0.11' });
	});

	it('keeps the release when the link is unusable, and drops only the link', () => {
		// The tag is what decides the notice; the link is an extra the line can do without.
		for (const html_url of [
			'javascript:alert(1)',
			'http://github.com/polandy/Stella/releases',
			'data:text/html,<script>alert(1)</script>',
			'not a url',
			'',
			42,
			null
		]) {
			expect(readLatestRelease({ tag_name: 'v0.0.11', html_url })).toEqual({
				tag: 'v0.0.11',
				url: null
			});
		}
	});

	it('refuses a body that names no tag', () => {
		expect(readLatestRelease({ html_url: 'https://example.test' })).toBeNull();
		expect(readLatestRelease({ tag_name: '' })).toBeNull();
		expect(readLatestRelease({ tag_name: 7 })).toBeNull();
		expect(readLatestRelease('nope')).toBeNull();
		expect(readLatestRelease(null)).toBeNull();
	});
});

describe('webUrlOrNull', () => {
	it('keeps an https page whole, query and fragment included', () => {
		expect(webUrlOrNull('https://example.test/a?b=c#d')).toBe('https://example.test/a?b=c#d');
	});
});
