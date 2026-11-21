import { describe, expect, test } from 'bun:test';
import {
	SNOOZE_DAYS,
	answerLater,
	answerNever,
	hintStorageKey,
	readAnswer,
	unlockHint,
	writeAnswer,
	type HintInput
} from './unlock-hint';

/*
 * The device-unlock hint (docs/dev/02 §2.10.1): when Home offers it. The day is passed in, so
 * the week a *Later* waits is read off the argument, never the clock.
 */

const ready: HintInput = {
	blurOn: true,
	hasPrivateEntry: true,
	capability: 'none',
	answer: null,
	today: '2026-11-21'
};

describe('unlockHint', () => {
	test('shows when blur is on, a private entry exists, the device can and nothing was answered', () => {
		expect(unlockHint(ready)).toBe('show');
	});

	test('hides without the blur switch', () => {
		expect(unlockHint({ ...ready, blurOn: false })).toBe('hidden');
	});

	test('hides until the member has a private entry', () => {
		expect(unlockHint({ ...ready, hasPrivateEntry: false })).toBe('hidden');
	});

	test('hides while the browser has not answered, and where it cannot do it', () => {
		expect(unlockHint({ ...ready, capability: 'checking' })).toBe('hidden');
		expect(unlockHint({ ...ready, capability: 'unsupported' })).toBe('hidden');
	});

	test('hides once set up on this device', () => {
		expect(unlockHint({ ...ready, capability: 'set-up' })).toBe('hidden');
	});

	test('hides for good after "Not on this device"', () => {
		expect(unlockHint({ ...ready, answer: answerNever() })).toBe('hidden');
	});

	test('hides for the week after "Later", on the last day included', () => {
		const answer = answerLater('2026-11-21');
		expect(answer).toEqual({ snoozedUntil: '2026-11-28' });
		expect(unlockHint({ ...ready, answer, today: '2026-11-27' })).toBe('hidden');
		expect(unlockHint({ ...ready, answer, today: '2026-11-28' })).toBe('show');
	});

	test('the snooze is seven days, across a month end', () => {
		expect(SNOOZE_DAYS).toBe(7);
		expect(answerLater('2026-12-28')).toEqual({ snoozedUntil: '2027-01-04' });
	});
});

describe('the stored answer', () => {
	test('round-trips both answers', () => {
		expect(readAnswer(writeAnswer(answerNever()))).toBe('never');
		expect(readAnswer(writeAnswer(answerLater('2026-11-21')))).toEqual({
			snoozedUntil: '2026-11-28'
		});
	});

	test('nothing stored, or something unreadable, is no answer', () => {
		expect(readAnswer(null)).toBeNull();
		expect(readAnswer('{')).toBeNull();
		expect(readAnswer('{"snoozedUntil":5}')).toBeNull();
		expect(readAnswer('"sometimes"')).toBeNull();
	});

	test('is kept per member', () => {
		expect(hintStorageKey('u1')).toBe('stella.unlockHint.u1');
		expect(hintStorageKey('u1')).not.toBe(hintStorageKey('u2'));
	});
});
