import { describe, expect, it } from 'bun:test';
import { FALLBACK_DESTINATION, safeDestination } from './safe-redirect';

describe('safeDestination', () => {
	it('keeps a path on this origin, query and fragment included', () => {
		expect(safeDestination('/settings?saved=1#language')).toBe('/settings?saved=1#language');
	});

	it('refuses a protocol-relative URL', () => {
		expect(safeDestination('//evil.test/steal')).toBe(FALLBACK_DESTINATION);
	});

	it('refuses a backslash-smuggled host', () => {
		expect(safeDestination('/\\evil.test')).toBe(FALLBACK_DESTINATION);
	});

	it('refuses an absolute URL and a scheme', () => {
		expect(safeDestination('https://evil.test')).toBe(FALLBACK_DESTINATION);
		expect(safeDestination('javascript:alert(1)')).toBe(FALLBACK_DESTINATION);
	});

	it('refuses anything that is not a string', () => {
		expect(safeDestination(null)).toBe(FALLBACK_DESTINATION);
		expect(safeDestination(undefined)).toBe(FALLBACK_DESTINATION);
	});
});
