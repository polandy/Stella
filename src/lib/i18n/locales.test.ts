import { describe, expect, it } from 'bun:test';
import { DEFAULT_LOCALE, isLocale, negotiateLocale } from './locales';

describe('isLocale', () => {
	it('accepts a supported language and rejects anything else', () => {
		expect(isLocale('de')).toBe(true);
		expect(isLocale('en')).toBe(true);
		expect(isLocale('fr')).toBe(false);
		expect(isLocale(null)).toBe(false);
	});
});

describe('negotiateLocale', () => {
	it('falls back to the default without a header', () => {
		expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
		expect(negotiateLocale('')).toBe(DEFAULT_LOCALE);
	});

	it('matches a regional tag to its base language', () => {
		expect(negotiateLocale('de-AT')).toBe('de');
	});

	it('honours quality values rather than order', () => {
		expect(negotiateLocale('en;q=0.4, de;q=0.9')).toBe('de');
	});

	it('skips languages we do not speak', () => {
		expect(negotiateLocale('fr-FR,fr;q=0.9,de;q=0.5')).toBe('de');
	});

	it('ignores a language offered with q=0', () => {
		expect(negotiateLocale('de;q=0, fr;q=0.8')).toBe(DEFAULT_LOCALE);
	});

	it('falls back when nothing is on offer', () => {
		expect(negotiateLocale('fr,es;q=0.7')).toBe(DEFAULT_LOCALE);
	});
});
