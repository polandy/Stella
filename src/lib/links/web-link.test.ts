import { describe, expect, it } from 'bun:test';
import { webLink } from './web-link';

/* The one rule for a link a gift or an outing carries: a web address, or none. */

describe('webLink', () => {
	it('keeps a web address as it was typed', () => {
		expect(webLink('https://shop.example/teapot?id=4')).toEqual({
			ok: true,
			url: 'https://shop.example/teapot?id=4'
		});
		expect(webLink('http://shop.example')).toEqual({ ok: true, url: 'http://shop.example' });
	});

	it('reads an address pasted without its scheme as a secure web address', () => {
		expect(webLink('  shop.example/teapot ')).toEqual({
			ok: true,
			url: 'https://shop.example/teapot'
		});
	});

	it('reads nothing as no link', () => {
		expect(webLink('   ')).toEqual({ ok: true, url: null });
	});

	it('refuses anything that is not a web address, so a link can never run script', () => {
		expect(webLink('javascript:alert(1)')).toEqual({ ok: false });
		expect(webLink('JavaScript:alert(1)')).toEqual({ ok: false });
		expect(webLink('data:text/html,hi')).toEqual({ ok: false });
		expect(webLink('mailto:hilde@example.test')).toEqual({ ok: false });
		expect(webLink('https://')).toEqual({ ok: false });
		expect(webLink('two words')).toEqual({ ok: false });
	});
});
