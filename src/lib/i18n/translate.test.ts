import { describe, expect, it } from 'bun:test';
import type { Locale } from './locales';
import { de } from './messages/de';
import { createTranslator, hasMessage } from './translate';

/*
 * The translator's own rules (docs/02 §2.19): a message missing from a translation falls
 * back to English rather than showing a raw key, and a key missing everywhere is a
 * programming error that must be loud rather than silent.
 */

describe('createTranslator', () => {
	it('says a message in the language asked for', () => {
		expect(createTranslator('de')('nav.people')).toBe('Menschen');
		expect(createTranslator('en')('nav.people')).toBe('People');
	});

	it('fills a message’s values', () => {
		expect(createTranslator('de')('contacts.count', { count: 2 })).toBe('2 Menschen');
	});

	it('falls back to English for a message a translation is missing', () => {
		// The compiler forbids a hole in the German catalogue, so one is punched at runtime:
		// this is the safety net for a message that goes missing some other way.
		const catalogue = de as unknown as Record<string, unknown>;
		const held = catalogue['nav.home'];
		delete catalogue['nav.home'];
		try {
			expect(createTranslator('de')('nav.home')).toBe('Home');
			// The positive control: the rest of the German catalogue is untouched.
			expect(createTranslator('de')('nav.people')).toBe('Menschen');
		} finally {
			catalogue['nav.home'] = held;
		}
	});

	it('falls back to English wholesale for a language it has no catalogue for', () => {
		expect(createTranslator('fr' as Locale)('nav.home')).toBe('Home');
	});

	it('throws on a key no catalogue knows, instead of rendering it', () => {
		const t = createTranslator('en') as (key: string) => string;
		expect(() => t('nav.nothing.like.this')).toThrow('Unknown message key: nav.nothing.like.this');
	});

	it('returns the same translator for a language, so lookups do not rebuild it', () => {
		expect(createTranslator('de')).toBe(createTranslator('de'));
	});
});

describe('hasMessage', () => {
	it('recognises a name built from a stored value', () => {
		expect(hasMessage('circles.kind.club')).toBe(true);
		expect(hasMessage('circles.kind.kegelclub-buehl')).toBe(false);
	});
});
