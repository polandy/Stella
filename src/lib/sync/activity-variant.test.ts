import { describe, expect, it } from 'bun:test';
import { ACTIVITY_VARIANTS, DEFAULT_ACTIVITY_VARIANT, parseActivityVariant } from './activity-variant';

describe('parseActivityVariant', () => {
	it('takes a name the app knows', () => {
		for (const variant of ACTIVITY_VARIANTS) expect(parseActivityVariant(variant)).toBe(variant);
	});

	it('falls back to the default for anything else', () => {
		expect(parseActivityVariant(null)).toBe(DEFAULT_ACTIVITY_VARIANT);
		expect(parseActivityVariant('')).toBe(DEFAULT_ACTIVITY_VARIANT);
		expect(parseActivityVariant('siren')).toBe(DEFAULT_ACTIVITY_VARIANT);
	});
});
