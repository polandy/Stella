import { describe, expect, it } from 'bun:test';
import { resolveLocale } from './resolve';

describe('resolveLocale', () => {
	it('prefers the signed-in profile over everything else', () => {
		expect(resolveLocale({ user: 'de', cookie: 'en', acceptLanguage: 'en-GB' })).toBe('de');
	});

	it('uses the cookie when nobody is signed in', () => {
		expect(resolveLocale({ cookie: 'de', acceptLanguage: 'en-GB' })).toBe('de');
	});

	it('ignores a cookie holding a language Stella does not speak', () => {
		expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'de-DE' })).toBe('de');
	});

	it('falls back to the browser preference', () => {
		expect(resolveLocale({ acceptLanguage: 'de-AT,de;q=0.9' })).toBe('de');
	});

	it('ends up at English when a request says nothing at all', () => {
		expect(resolveLocale({})).toBe('en');
	});
});
