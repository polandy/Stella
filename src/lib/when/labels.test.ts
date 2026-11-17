import { describe, expect, it } from 'bun:test';
import { INTL_LOCALES } from '../i18n/locales';
import { createTranslator } from '../i18n/translate';
import { whenChip, whenPreview } from './labels';
import { whenOutlook } from './resolve';

/* How a when reads: the chip on a row, the line under the picker (docs/dev/02 §2.25.8). */

const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
const full = { value: '2018-03-14', precision: 'full' as const };
const estimated = { value: '2018', precision: 'age' as const };
const today = '2026-10-08';

describe('whenChip', () => {
	it.each([
		[{ kind: 'from_age', age: 8 }, 'From age 8', 'Ab 8 Jahren'],
		[{ kind: 'at_age', age: 10 }, 'For the 10th birthday', 'Zum 10. Geburtstag'],
		[{ kind: 'at_age', age: 21 }, 'For the 21st birthday', 'Zum 21. Geburtstag'],
		[{ kind: 'at_age', age: 12 }, 'For the 12th birthday', 'Zum 12. Geburtstag'],
		[{ kind: 'on_date', on: '2027-12-24' }, 'Christmas 2027', 'Weihnachten 2027'],
		[{ kind: 'on_date', on: '2027-05-03' }, 'For 3 May 2027', 'Zum 3. Mai 2027'],
		[{ kind: 'later' }, 'Later', 'Später']
	] as const)('%o reads “%s”', (when, english, german) => {
		expect(whenChip(en, when)).toBe(english);
		expect(whenChip(de, when)).toBe(german);
	});
});

describe('whenPreview', () => {
	const preview = (lang: typeof en, ...args: Parameters<typeof whenOutlook>) =>
		whenPreview(lang, whenOutlook(...args));

	it('says now, and later, plainly', () => {
		expect(preview(en, null, full, today)).toBe('Shows among the ideas now.');
		expect(preview(de, { kind: 'later' }, full, today)).toBe(
			'Wartet unter „Später“, bis du sie aufgreifst.'
		);
	});

	it('names the birthday and the day the idea comes back', () => {
		expect(preview(en, { kind: 'at_age', age: 10 }, full, today)).toBe(
			'Turns 10 on 14 March 2028. It waits until 15 December 2027, then shows among the ideas.'
		);
	});

	it('says an age already reached holds now', () => {
		expect(preview(en, { kind: 'from_age', age: 6 }, full, today)).toBe(
			'Already 8, so it shows among the ideas now.'
		);
	});

	it('says a near day shows at once', () => {
		expect(preview(de, { kind: 'on_date', on: '2026-12-24' }, full, today)).toBe(
			'Fällig am 24. Dezember 2026. Sie steht gleich bei den Ideen.'
		);
	});

	it('says an estimated year as about', () => {
		expect(preview(en, { kind: 'at_age', age: 12 }, estimated, today)).toBe(
			'Turns 12 in about 2030. It waits until 3 October 2029, then shows among the ideas.'
		);
		expect(preview(de, { kind: 'at_age', age: 12 }, estimated, today)).toBe(
			'Wird ungefähr 2030 12. Sie wartet bis zum 3. Oktober 2029, dann steht sie bei den Ideen.'
		);
	});

	it('says what is wrong with a choice that cannot be kept', () => {
		expect(preview(en, { kind: 'at_age', age: 5 }, full, today)).toBe(
			'That birthday is over. Choose a later one.'
		);
		expect(preview(en, { kind: 'at_age', age: 10 }, null, today)).toBe(
			'An age needs their birth year, or an estimate of it.'
		);
	});
});
