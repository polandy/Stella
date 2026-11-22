import { describe, expect, it } from 'bun:test';
import { storedValueOf, valueFromForm, valueLabel } from './value';

describe('valueFromForm (§2.25.16)', () => {
	it('reads a whole number, nothing for a blank', () => {
		expect(valueFromForm('120')).toBe(120);
		expect(valueFromForm(' 45 ')).toBe(45);
		expect(valueFromForm('0')).toBe(0);
		expect(valueFromForm('')).toBeNull();
		expect(valueFromForm('  ')).toBeNull();
		expect(valueFromForm(null)).toBeNull();
	});

	it('ignores the thousands marks people type', () => {
		expect(valueFromForm("1'250")).toBe(1250);
		expect(valueFromForm('1 250')).toBe(1250);
		expect(valueFromForm('1’250')).toBe(1250);
	});

	it('refuses decimals, negatives and words rather than guess', () => {
		expect(valueFromForm('12.50')).toBe('invalid');
		expect(valueFromForm('12,5')).toBe('invalid');
		expect(valueFromForm('-3')).toBe('invalid');
		expect(valueFromForm('cheap')).toBe('invalid');
	});
});

describe('valueLabel (§2.25.16)', () => {
	it('puts the instance currency after the amount', () => {
		expect(valueLabel(120, 'CHF', 'de-CH')).toBe('120 CHF');
		expect(valueLabel(1250, 'EUR', 'en')).toBe('1,250 EUR');
	});

	it('shows the amount alone when the instance has no currency', () => {
		expect(valueLabel(45, '', 'en')).toBe('45');
	});
});

describe('storedValueOf', () => {
	it('keeps a whole number from zero up, and nothing else', () => {
		expect(storedValueOf(45)).toBe(45);
		expect(storedValueOf(0)).toBe(0);
		for (const raw of [-3, 12.5, '45', null, undefined, 1_000_000_000]) {
			expect(storedValueOf(raw)).toBeNull();
		}
	});
});
