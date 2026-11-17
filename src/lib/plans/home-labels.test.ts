import { describe, expect, it } from 'bun:test';
import type { DateLanguage } from '../dates/labels';
import { INTL_LOCALES } from '../i18n/locales';
import { createTranslator } from '../i18n/translate';
import { passedPlanLabel, planDayLabel } from './home-labels';

/* How an idea's day reads on Home (docs/dev/02 §2.27.7), in the real catalogues. */

const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
const TODAY = '2026-11-17';
const exact = (on: string) => ({ on, approximate: false });

describe('planDayLabel', () => {
	it.each([
		[
			'a day this week, spoken',
			{ kind: 'on_date', on: '2026-11-20' },
			exact('2026-11-20'),
			'in 3 days'
		],
		['tomorrow', { kind: 'on_date', on: '2026-11-18' }, exact('2026-11-18'), 'tomorrow'],
		['a month, by its name', { kind: 'in_month', on: '2027-03' }, exact('2027-03-01'), 'in March'],
		[
			'a month a year ahead, with its year',
			{ kind: 'in_month', on: '2027-11' },
			exact('2027-11-01'),
			'in November 2027'
		],
		[
			'an estimated year',
			{ kind: 'at_age', age: 9 },
			{ on: '2027-01-01', approximate: true },
			'about 2027'
		],
		[
			'a day half a year ahead, with its year',
			{ kind: 'on_date', on: '2027-07-01' },
			exact('2027-07-01'),
			'1 July 2027'
		]
	] as const)('%s', (_, when, placed, label) => {
		expect(planDayLabel(en, when, placed, TODAY)).toBe(label);
	});

	it('says *im März* in German', () => {
		expect(planDayLabel(de, { kind: 'in_month', on: '2027-03' }, exact('2027-03-01'), TODAY)).toBe(
			'im März'
		);
	});

	it('names a day a few weeks ahead by weekday and date', () => {
		expect(
			planDayLabel(en, { kind: 'on_date', on: '2026-12-12' }, exact('2026-12-12'), TODAY)
		).toMatch(/Sat.*12 Dec/);
	});
});

describe('passedPlanLabel', () => {
	it('marks the day gone by', () => {
		expect(
			passedPlanLabel(de, { kind: 'on_date', on: '2026-11-15' }, exact('2026-11-15'), TODAY)
		).toBe('Zum 15. November 2026 · vorbei');
	});

	it('reads the same for a Coming up row, whose own kind is not the state', () => {
		const row = { kind: 'ask' as const, ...exact('2026-11-15'), plan: {} };
		expect(passedPlanLabel(de, { kind: 'on_date', on: '2026-11-15' }, row, TODAY)).toBe(
			'Zum 15. November 2026 · vorbei'
		);
	});
});
