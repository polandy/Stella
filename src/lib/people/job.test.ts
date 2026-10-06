import { describe, expect, it } from 'bun:test';
import { foundByJob, jobErrorFor, jobOf, jobShortForm } from './job';

/*
 * A person's job title and company (docs/02 §2.2): one short form wherever they are shown, and
 * a tag on a search row that only the job explains (docs/02 §2.9).
 */

const at = (p: { job: string; company: string }) => `${p.job} at ${p.company}`;

describe('jobOf', () => {
	it('keeps both parts, trimmed', () => {
		expect(jobOf({ jobTitle: ' Teacher ', company: ' Primarschule Muri ' })).toEqual({
			jobTitle: 'Teacher',
			company: 'Primarschule Muri'
		});
	});

	it('turns a blank part into null', () => {
		expect(jobOf({ jobTitle: 'Teacher', company: '   ' })).toEqual({
			jobTitle: 'Teacher',
			company: null
		});
	});

	it('is null when neither part is on record', () => {
		expect(jobOf({ jobTitle: null, company: '' })).toBeNull();
		expect(jobOf({})).toBeNull();
	});
});

describe('jobShortForm', () => {
	it('reads "job at company" when both are on record', () => {
		expect(jobShortForm({ jobTitle: 'Teacher', company: 'Primarschule Muri' }, at)).toBe(
			'Teacher at Primarschule Muri'
		);
	});

	it('shows the one part alone when the other is missing', () => {
		expect(jobShortForm({ jobTitle: 'Retired', company: null }, at)).toBe('Retired');
		expect(jobShortForm({ jobTitle: '  ', company: 'Roche' }, at)).toBe('Roche');
	});

	it('is null when nothing is on record', () => {
		expect(jobShortForm({ jobTitle: null, company: null }, at)).toBeNull();
	});
});

describe('foundByJob', () => {
	const claudia = {
		displayName: 'Claudia Frei',
		firstName: 'Claudia',
		lastName: 'Frei',
		nickname: null,
		description: 'Noah’s godmother',
		jobTitle: 'Project lead',
		company: 'Roche Diagnostics'
	};

	it('says so when the query is found in the job or company and nowhere in the names or description', () => {
		expect(foundByJob(claudia, 'roche')).toBe(true);
		expect(foundByJob(claudia, 'proj')).toBe(true);
	});

	it('folds case and accents as the rest of the matching does', () => {
		expect(
			foundByJob(
				{ displayName: 'Eva Lehmann', jobTitle: 'Lehrerin', company: 'Musikschule Wöhlen' },
				'WOHLEN'
			)
		).toBe(true);
	});

	it('stays quiet when a name or the description explains the match', () => {
		expect(foundByJob(claudia, 'claud')).toBe(false);
		expect(foundByJob(claudia, 'godmother')).toBe(false);
		expect(
			foundByJob({ displayName: 'Eva Lehmann', jobTitle: 'Lehrerin', company: null }, 'leh')
		).toBe(false);
	});

	it('reads each word of the query, so a name plus a job still says why', () => {
		expect(foundByJob(claudia, 'Claudia Roche')).toBe(true);
	});

	it('stays quiet without a job, or without a query', () => {
		expect(
			foundByJob({ displayName: 'Daniel Brunner', jobTitle: null, company: null }, 'roche')
		).toBe(false);
		expect(foundByJob(claudia, '  ')).toBe(false);
	});
});

describe('jobErrorFor', () => {
	/* Two editors post to the one action; a refusal reopens only the one that posted. */
	const failedInHeader = { jobError: 'Too long', jobErrorAt: 'header' };

	it('hands the error to the editor that posted', () => {
		expect(jobErrorFor('header', failedInHeader)).toBe('Too long');
	});

	it('keeps it from the other one', () => {
		expect(jobErrorFor('profile', failedInHeader)).toBeNull();
	});

	it('is null with no result, or a result about something else', () => {
		expect(jobErrorFor('profile', null)).toBeNull();
		expect(jobErrorFor('profile', { genderError: 'x' })).toBeNull();
	});
});
