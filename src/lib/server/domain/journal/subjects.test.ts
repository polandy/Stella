import { describe, expect, it } from 'bun:test';
import {
	JournalSubjectNotAllowedError,
	NoJournalSubjectError,
	subjectKeyOf,
	subjectsForAudience,
	withUnseenSubjects
} from './subjects';

describe('subjectKeyOf', () => {
	it('is the same for the same people in any order, so the slot is the set', () => {
		expect(subjectKeyOf(['tim', 'markus', 'lea'])).toBe('lea,markus,tim');
		expect(subjectKeyOf(['lea', 'tim', 'markus', 'tim'])).toBe('lea,markus,tim');
	});

	it('is the one id for a one-person entry, as every entry before ADR-131 is keyed', () => {
		expect(subjectKeyOf(['markus'])).toBe('markus');
	});
});

describe('subjectsForAudience', () => {
	const visible = [
		{ id: 'markus', visibility: 'shared' as const },
		{ id: 'sandra', visibility: 'shared' as const },
		{ id: 'secret', visibility: 'private' as const }
	];

	it('keeps the order given, the anchor first, each once', () => {
		expect(subjectsForAudience(visible, 'shared', ['sandra', 'markus', 'sandra'])).toEqual([
			'sandra',
			'markus'
		]);
	});

	it('refuses a private person in a shared moment, rather than drop them', () => {
		expect(() => subjectsForAudience(visible, 'shared', ['markus', 'secret'])).toThrow(
			JournalSubjectNotAllowedError
		);
		expect(subjectsForAudience(visible, 'private', ['markus', 'secret'])).toEqual([
			'markus',
			'secret'
		]);
	});

	it('refuses someone the author does not see, and nobody at all', () => {
		expect(() => subjectsForAudience(visible, 'private', ['markus', 'stranger'])).toThrow(
			JournalSubjectNotAllowedError
		);
		expect(() => subjectsForAudience(visible, 'shared', [])).toThrow(NoJournalSubjectError);
	});

	it('keeps a person already on the moment, archived since and so in no list', () => {
		expect(subjectsForAudience(visible, 'shared', ['archived', 'markus'], ['archived'])).toEqual([
			'archived',
			'markus'
		]);
	});
});

describe('withUnseenSubjects', () => {
	it('keeps a subject the author cannot see, which the editor had no chip for', () => {
		const visible = [{ id: 'markus' }, { id: 'lea' }];
		expect(withUnseenSubjects(['lea'], ['markus', 'hidden', 'lea'], visible)).toEqual([
			'lea',
			'hidden'
		]);
	});
});
