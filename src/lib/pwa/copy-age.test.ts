import { describe, expect, test } from 'bun:test';
import type { DateLanguage } from '$lib/dates/labels';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import { copyAge } from './copy-age';

/*
 * How old the page on screen is, in the offline line (docs/02 §2.18, *Saying so*).
 * "Now" is Tuesday, 29 September 2026, 21:30 in Zurich throughout; the zone is handed in, so
 * nothing here depends on where the tests run.
 */
const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
const ZONE = 'Europe/Zurich';
const NOW = Date.parse('2026-09-29T21:30:00+02:00');
const at = (local: string) => Date.parse(`${local}+02:00`);

describe('copyAge', () => {
	test('names today and yesterday, with the time, the way someone would say it', () => {
		expect(copyAge(en, at('2026-09-29T09:12:00'), NOW, ZONE)).toBe('today 09:12');
		expect(copyAge(en, at('2026-09-28T18:04:00'), NOW, ZONE)).toBe('yesterday 18:04');
		expect(copyAge(de, at('2026-09-28T18:04:00'), NOW, ZONE)).toBe('gestern 18:04');
	});

	test('counts days in the viewer’s zone, not in UTC', () => {
		// 00:30 in Zurich is still the evening before in UTC; it is today on the phone.
		expect(copyAge(en, at('2026-09-29T00:30:00'), NOW, ZONE)).toBe('today 00:30');
	});

	test('dates anything older, and adds the year only when it is another one', () => {
		expect(copyAge(en, at('2026-09-20T08:00:00'), NOW, ZONE)).toBe('20 Sept 08:00');
		expect(copyAge(de, at('2026-09-20T08:00:00'), NOW, ZONE)).toBe('20. Sept. 08:00');
		expect(copyAge(en, Date.parse('2025-12-31T10:00:00+01:00'), NOW, ZONE)).toBe(
			'31 Dec 2025 10:00'
		);
	});

	test('treats a copy from a clock running ahead as from today, never as from the future', () => {
		expect(copyAge(en, at('2026-09-29T21:45:00'), NOW, ZONE)).toBe('today 21:45');
	});
});
