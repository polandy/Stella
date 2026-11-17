import { describe, expect, it } from 'bun:test';
import { INTL_LOCALES } from '../i18n/locales';
import { createTranslator } from '../i18n/translate';
import { whenChip, whenPreview, whenStateChip } from './labels';
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
		[{ kind: 'in_month', on: '2027-05' }, 'In May 2027', 'Im Mai 2027'],
		[{ kind: 'later' }, 'Later', 'Später']
	] as const)('%o reads “%s”', (when, english, german) => {
		expect(whenChip(en, when)).toBe(english);
		expect(whenChip(de, when)).toBe(german);
	});
});

describe('whenStateChip', () => {
	const six = { kind: 'at_age', age: 6 } as const;
	it.each([
		[{ kind: 'waiting' }, 'For the 6th birthday', 'Zum 6. Geburtstag'],
		[
			{ kind: 'soon', on: '2026-11-11', approximate: false, inDays: 34 },
			'For the 6th birthday · in 34 days',
			'Zum 6. Geburtstag · in 34 Tagen'
		],
		[
			{ kind: 'soon', on: '2026-10-09', approximate: false, inDays: 1 },
			'For the 6th birthday · tomorrow',
			'Zum 6. Geburtstag · morgen'
		],
		[
			{ kind: 'soon', on: '2027-01-01', approximate: true, inDays: 85 },
			'For the 6th birthday · about 2027',
			'Zum 6. Geburtstag · etwa 2027'
		],
		[
			{ kind: 'due', on: today, approximate: false },
			'For the 6th birthday · today',
			'Zum 6. Geburtstag · heute'
		],
		[
			{ kind: 'due', on: '2026-01-01', approximate: true },
			'For the 6th birthday',
			'Zum 6. Geburtstag'
		],
		[
			{ kind: 'passed', on: '2026-10-01', approximate: false },
			'For the 6th birthday · passed',
			'Zum 6. Geburtstag · vorbei'
		]
	] as const)('%o reads “%s”', (state, english, german) => {
		expect(whenStateChip(en, six, state, today)).toBe(english);
		expect(whenStateChip(de, six, state, today)).toBe(german);
	});

	it('a month on its first day does not read as today', () => {
		const may = { kind: 'in_month', on: '2026-10' } as const;
		const due = { kind: 'due', on: '2026-10-01', approximate: false } as const;
		expect(whenStateChip(en, may, due, '2026-10-01')).toBe('In October 2026');
	});

	it('a later one at its look reads as later', () => {
		expect(whenStateChip(en, { kind: 'later' }, { kind: 'review', on: '2027-03-14' }, today)).toBe(
			'Later'
		);
	});
});

describe('whenPreview', () => {
	const preview = (lang: typeof en, ...args: Parameters<typeof whenOutlook>) =>
		whenPreview(lang, whenOutlook(...args));

	it('says now, and later, plainly', () => {
		expect(preview(en, null, full, today)).toBe('Shows among the ideas now.');
		expect(preview(de, { kind: 'later' }, full, today)).toBe(
			'Wartet unter „Später“. Einmal im Jahr kommt die Frage, ob sie noch aktuell ist.'
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

	it('names a month, and when it comes back', () => {
		expect(preview(en, { kind: 'in_month', on: '2027-05' }, full, today)).toBe(
			'In May 2027. It waits until 31 January 2027, then shows among the ideas.'
		);
		expect(preview(de, { kind: 'in_month', on: '2026-11' }, full, today)).toBe(
			'Im November 2026. Sie steht gleich bei den Ideen.'
		);
		expect(preview(en, { kind: 'in_month', on: '2026-09' }, full, today)).toBe(
			'That month is over. Choose one still ahead.'
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
