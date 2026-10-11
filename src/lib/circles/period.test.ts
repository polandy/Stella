import { describe, expect, it } from 'bun:test';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { DateLanguage } from '$lib/dates/labels';
import { circlePeriodLabel } from './period';

/*
 * A circle's period on its page's header line (docs/02 §2.4.2): months, not days — a school
 * year reads as *Aug 2025 – Jul 2026* — in the reader's language.
 */

const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

describe('circlePeriodLabel', () => {
	it('names the months of a period that has both ends', () => {
		expect(circlePeriodLabel(en, '2025-08-18', '2026-07-03')).toBe('Aug 2025 – Jul 2026');
		expect(circlePeriodLabel(de, '2025-08-18', '2026-07-03')).toBe('Aug. 2025 – Juli 2026');
	});

	it('says from or until for an open end', () => {
		expect(circlePeriodLabel(en, '2025-08-18', null)).toBe('from Aug 2025');
		expect(circlePeriodLabel(de, '2025-08-18', null)).toBe('ab Aug. 2025');
		expect(circlePeriodLabel(en, null, '2026-07-03')).toBe('until Jul 2026');
		expect(circlePeriodLabel(de, null, '2026-07-03')).toBe('bis Juli 2026');
	});

	it('reads an imported date at the precision it was written in', () => {
		expect(circlePeriodLabel(en, '2025', '2026-07')).toBe('2025 – Jul 2026');
	});

	it('is nothing without a period', () => {
		expect(circlePeriodLabel(en, null, null)).toBeNull();
	});
});
