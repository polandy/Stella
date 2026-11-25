import { describe, expect, it } from 'bun:test';
import type { DateLanguage } from '#lib/dates/labels.js';
import { INTL_LOCALES } from '#lib/i18n/locales.js';
import { createTranslator } from '#lib/i18n/translate.js';
import {
	circleIsPast,
	isApproximate,
	periodFaceCaption,
	memberWindow,
	periodFace,
	thenChangesAnything,
	windowBounds,
	type FaceCandidate,
	type PeriodWindow,
	type FaceFit
} from './period-face';

// The pick of a member's face for a circle's time and its fallbacks (docs/dev/02 §2.4.2).

const CIRCLE = 'class-1b';
const TODAY = '2026-11-25';
const at = (day: string) => Date.parse(`${day}T12:00:00Z`);
const face = (photoId: string, day: string, circleId: string | null = null): FaceCandidate => ({
	photoId,
	datedAt: at(day),
	circleId
});
const SCHOOL_YEAR = { start: '2018-08-01', end: '2019-07-31' };

function pick(
	faces: FaceCandidate[],
	avatarPhotoId: string | null = 'today',
	window: PeriodWindow = SCHOOL_YEAR
) {
	return periodFace({ circleId: CIRCLE, window, today: TODAY, faces, avatarPhotoId });
}

describe('memberWindow', () => {
	it('takes the membership’s own period over the circle’s', () => {
		expect(
			memberWindow(
				{ startDate: '2019-02-01', endDate: '2019-06-30' },
				{ startDate: '2018-08-01', endDate: '2022-07-31' }
			)
		).toEqual({ start: '2019-02-01', end: '2019-06-30' });
	});

	it('fills an end the membership leaves open from the circle', () => {
		expect(
			memberWindow(
				{ startDate: '2019-02-01', endDate: null },
				{ startDate: '2018-08-01', endDate: '2022-07-31' }
			)
		).toEqual({ start: '2019-02-01', end: '2022-07-31' });
	});

	it('is the circle’s period for a membership without dates', () => {
		expect(
			memberWindow({ startDate: null, endDate: null }, { startDate: '2018-08-01', endDate: null })
		).toEqual({ start: '2018-08-01', end: null });
	});
});

describe('windowBounds', () => {
	it('runs from the first to the last moment of day-precision ends', () => {
		expect(windowBounds({ start: '2018-08-01', end: '2019-07-31' }, TODAY)).toEqual({
			from: Date.parse('2018-08-01T00:00:00Z'),
			to: Date.parse('2019-08-01T00:00:00Z') - 1
		});
	});

	it('reads an imported month or year as the whole month or year', () => {
		expect(windowBounds({ start: '2018-08', end: '2019' }, TODAY)).toEqual({
			from: Date.parse('2018-08-01T00:00:00Z'),
			to: Date.parse('2020-01-01T00:00:00Z') - 1
		});
		expect(windowBounds({ start: '2018', end: '2018-12' }, TODAY)).toEqual({
			from: Date.parse('2018-01-01T00:00:00Z'),
			to: Date.parse('2019-01-01T00:00:00Z') - 1
		});
	});

	it('ends an open period at the end of today', () => {
		expect(windowBounds({ start: '2018-08-01', end: null }, TODAY)).toEqual({
			from: Date.parse('2018-08-01T00:00:00Z'),
			to: Date.parse('2026-11-26T00:00:00Z') - 1
		});
	});

	it('has no start when only the end is known', () => {
		expect(windowBounds({ start: null, end: '2019-07-31' }, TODAY)).toEqual({
			from: null,
			to: Date.parse('2019-08-01T00:00:00Z') - 1
		});
	});

	it('is null for an undated membership in an undated circle', () => {
		expect(windowBounds({ start: null, end: null }, TODAY)).toBeNull();
	});
});

describe('periodFace', () => {
	it('shows the newest face dated inside the window', () => {
		expect(
			pick([
				face('old', '2015-05-01'),
				face('a', '2018-09-10'),
				face('b', '2019-03-02'),
				face('new', '2025-01-01')
			])
		).toEqual({
			photoId: 'b',
			fit: 'inside',
			datedAt: at('2019-03-02')
		});
	});

	it('lets a cut from this circle’s own photos win over a newer face inside', () => {
		expect(pick([face('b', '2019-03-02'), face('cut', '2018-10-05', CIRCLE)])).toEqual({
			photoId: 'cut',
			fit: 'circle',
			datedAt: at('2018-10-05')
		});
	});

	it('takes this circle’s cut even when its photo is dated outside the window', () => {
		expect(pick([face('cut', '2021-06-01', CIRCLE)]).fit).toBe('circle');
	});

	it('does not count a cut from another circle’s photo as this circle’s', () => {
		expect(pick([face('other', '2018-10-05', 'class-2a')])).toEqual({
			photoId: 'other',
			fit: 'inside',
			datedAt: at('2018-10-05')
		});
	});

	it('counts faces exactly on the first and the last day as inside', () => {
		expect(pick([face('first', '2018-08-01')]).fit).toBe('inside');
		const lastMoment = Date.parse('2019-07-31T23:59:59Z');
		expect(pick([{ photoId: 'last', datedAt: lastMoment, circleId: null }]).fit).toBe('inside');
		expect(pick([{ photoId: 'next', datedAt: lastMoment + 1000, circleId: null }]).fit).toBe(
			'after'
		);
	});

	it('falls back to the nearest earlier face before a later one', () => {
		expect(
			pick([face('older', '2015-01-01'), face('2017', '2017-06-01'), face('later', '2019-12-01')])
		).toEqual({
			photoId: '2017',
			fit: 'before',
			datedAt: at('2017-06-01')
		});
	});

	it('takes the nearest later face within two years when there is none earlier', () => {
		expect(pick([face('2022', '2022-01-01'), face('2020', '2020-03-01')])).toEqual({
			photoId: '2020',
			fit: 'after',
			datedAt: at('2020-03-01')
		});
	});

	it('takes no later face past two years after the end, and shows today’s instead', () => {
		expect(pick([face('2021', '2021-08-02')])).toEqual({
			photoId: 'today',
			fit: 'today',
			datedAt: null
		});
		expect(pick([face('edge', '2021-07-31')]).fit).toBe('after');
	});

	it('shows today’s picture when the person has no face at all but wears one', () => {
		expect(pick([])).toEqual({ photoId: 'today', fit: 'today', datedAt: null });
	});

	it('shows the initials when there is no face and no picture of today', () => {
		expect(pick([], null)).toEqual({ photoId: null, fit: 'none', datedAt: null });
		expect(pick([face('far', '2024-01-01')], null)).toEqual({
			photoId: null,
			fit: 'none',
			datedAt: null
		});
	});

	it('has nothing before an open start, so it looks inside and after only', () => {
		const window = { start: null, end: '2019-07-31' };
		expect(pick([face('2010', '2010-01-01')], 'today', window).fit).toBe('inside');
		expect(pick([face('2020', '2020-01-01')], 'today', window).fit).toBe('after');
	});

	it('has nothing after an open end, which is today', () => {
		const window = { start: '2018-08-01', end: null };
		expect(pick([face('2025', '2025-01-01')], 'today', window).fit).toBe('inside');
	});

	it('shows today’s picture unmarked when the member has no window at all', () => {
		const window = { start: null, end: null };
		expect(pick([face('2018', '2018-09-01')], 'today', window)).toEqual({
			photoId: 'today',
			fit: 'current',
			datedAt: null
		});
		expect(pick([], null, window).fit).toBe('none');
		expect(pick([face('cut', '2018-10-05', CIRCLE)], 'today', window).fit).toBe('circle');
	});
});

describe('circleIsPast', () => {
	it('is past once the end lies before today', () => {
		expect(circleIsPast({ endDate: '2019-07-31' }, TODAY)).toBe(true);
		expect(circleIsPast({ endDate: '2019' }, TODAY)).toBe(true);
	});

	it('is running on its last day, without an end, and with an end ahead', () => {
		expect(circleIsPast({ endDate: TODAY }, TODAY)).toBe(false);
		expect(circleIsPast({ endDate: '2026-11' }, TODAY)).toBe(false);
		expect(circleIsPast({ endDate: null }, TODAY)).toBe(false);
		expect(circleIsPast({ endDate: '2027-07-31' }, TODAY)).toBe(false);
	});
});

describe('thenChangesAnything', () => {
	it('is true when one member’s face then differs from their picture of today', () => {
		expect(
			thenChangesAnything([
				{ avatarPhotoId: 'a', face: { photoId: 'a', fit: 'inside', datedAt: 1 } },
				{ avatarPhotoId: 'b', face: { photoId: 'old-b', fit: 'before', datedAt: 1 } }
			])
		).toBe(true);
	});

	it('is false when every face then is the picture of today, or nobody is there', () => {
		expect(
			thenChangesAnything([
				{ avatarPhotoId: 'a', face: { photoId: 'a', fit: 'today', datedAt: null } },
				{ avatarPhotoId: null, face: { photoId: null, fit: 'none', datedAt: null } }
			])
		).toBe(false);
		expect(thenChangesAnything([])).toBe(false);
	});
});

describe('periodFaceCaption', () => {
	const en: DateLanguage = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de: DateLanguage = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
	const dated = (fit: 'circle' | 'inside' | 'before' | 'after') =>
		({ photoId: 'p', fit, datedAt: at('2018-10-05') }) as const;

	it('names the group photo and its month for a cut from the circle', () => {
		expect(periodFaceCaption(en, dated('circle'))).toBe('Group photo · Oct 2018');
		expect(periodFaceCaption(de, dated('circle'))).toBe('Gruppenfoto · Okt. 2018');
	});

	it('gives the month of a face inside the window', () => {
		expect(periodFaceCaption(en, dated('inside'))).toBe('Oct 2018');
		expect(periodFaceCaption(de, dated('inside'))).toBe('Okt. 2018');
	});

	it('gives the year and says nearest for a face before or after it', () => {
		expect(periodFaceCaption(en, dated('before'))).toBe('2018 · nearest');
		expect(periodFaceCaption(de, dated('after'))).toBe('2018 · nächstliegend');
	});

	it('says today’s photo, and nothing for an undated window or no picture', () => {
		expect(periodFaceCaption(en, { photoId: 'p', fit: 'today', datedAt: null })).toBe(
			'Today’s photo'
		);
		expect(periodFaceCaption(de, { photoId: 'p', fit: 'today', datedAt: null })).toBe(
			'Heutiges Foto'
		);
		expect(periodFaceCaption(en, { photoId: 'p', fit: 'current', datedAt: null })).toBeNull();
		expect(periodFaceCaption(en, { photoId: null, fit: 'none', datedAt: null })).toBeNull();
	});
});

describe('isApproximate', () => {
	it('rings only the closest Stella has, not a face from the time or none', () => {
		const of = (fit: FaceFit) => isApproximate({ photoId: 'p', fit, datedAt: null });
		expect(['before', 'after', 'today'].map((f) => of(f as FaceFit))).toEqual([true, true, true]);
		expect(['circle', 'inside', 'current', 'none'].map((f) => of(f as FaceFit))).toEqual([
			false,
			false,
			false,
			false
		]);
	});
});
