import { describe, expect, it } from 'bun:test';
import { mergeProfiles, type MergeableProfile } from './merge-profile';

/*
 * Combining two profiles into one (docs/02 §2.2). The survivor keeps everything it says; the
 * record being merged away only ever fills blanks — except for the two pairs of fields that
 * would lie if they were filled one at a time.
 */

const empty: MergeableProfile = {
	firstName: null,
	lastName: null,
	nickname: null,
	prefix: null,
	suffix: null,
	formerName: null,
	gender: null,
	pronouns: null,
	description: null,
	avatarPhotoId: null,
	birthDate: null,
	birthDatePrecision: 'full',
	isDeceased: false,
	deathDate: null,
	jobTitle: null,
	company: null,
	howWeMet: null,
	metDate: null,
	metPlace: null
};

const profile = (over: Partial<MergeableProfile>): MergeableProfile => ({ ...empty, ...over });

describe('mergeProfiles', () => {
	it('fills what the survivor leaves blank', () => {
		const merged = mergeProfiles(
			profile({ firstName: 'Hans' }),
			profile({ firstName: 'Hansueli', lastName: 'Müller', jobTitle: 'Schreiner' })
		);

		expect(merged.firstName).toBe('Hans'); // the survivor's own answer stands
		expect(merged.lastName).toBe('Müller');
		expect(merged.jobTitle).toBe('Schreiner');
	});

	it('takes the birth date and its precision as one, never one from each', () => {
		// Half of each would claim a day nobody entered (docs/03 §3.4).
		const merged = mergeProfiles(
			profile({ birthDate: null, birthDatePrecision: 'year' }),
			profile({ birthDate: '--04-23', birthDatePrecision: 'month_day' })
		);

		expect(merged).toMatchObject({ birthDate: '--04-23', birthDatePrecision: 'month_day' });
	});

	it('keeps the survivor birth date and precision untouched when it has one', () => {
		const merged = mergeProfiles(
			profile({ birthDate: '1955-11-02', birthDatePrecision: 'full' }),
			profile({ birthDate: '1955', birthDatePrecision: 'year' })
		);

		expect(merged).toMatchObject({ birthDate: '1955-11-02', birthDatePrecision: 'full' });
	});

	it('carries a death across, with the day it was recorded with', () => {
		const merged = mergeProfiles(
			profile({ isDeceased: false }),
			profile({ isDeceased: true, deathDate: '2021-03-04' })
		);

		expect(merged).toMatchObject({ isDeceased: true, deathDate: '2021-03-04' });
	});

	it('does not resurrect anyone the survivor already records as gone', () => {
		const merged = mergeProfiles(
			profile({ isDeceased: true, deathDate: '2020-01-01' }),
			profile({ isDeceased: false })
		);

		expect(merged).toMatchObject({ isDeceased: true, deathDate: '2020-01-01' });
	});

	it('wears the other face only when the survivor has none', () => {
		expect(mergeProfiles(profile({ avatarPhotoId: 'p-keep' }), profile({ avatarPhotoId: 'p-other' })).avatarPhotoId).toBe('p-keep');
		expect(mergeProfiles(profile({}), profile({ avatarPhotoId: 'p-other' })).avatarPhotoId).toBe('p-other');
	});

	it('changes nothing when the record merged away says nothing at all', () => {
		const keep = profile({ firstName: 'Hans', description: 'Nachbar', birthDate: '1955-11-02' });

		expect(mergeProfiles(keep, empty)).toEqual(keep);
	});
});
