import { describe, expect, it } from 'bun:test';
import { COMMAND_TYPES, isCommandType, isQueueable, kindOf } from './commands';

/*
 * The command vocabulary (docs/concepts/offline-capture.md §3): which changes exist and what
 * kind each one is. The kind is what decides whether a device may hold a command back while
 * Stella is out of reach, so the table is the whole of that rule.
 */

describe('the command vocabulary', () => {
	it('names capturing a moment as an addition', () => {
		expect(kindOf('moment.capture')).toBe('add');
	});

	it('lets a device queue only additions', () => {
		for (const type of COMMAND_TYPES) {
			expect(isQueueable(type)).toBe(kindOf(type) === 'add');
		}
		expect(isQueueable('moment.capture')).toBe(true);
	});

	it('recognises its own types and nothing else', () => {
		expect(isCommandType('moment.capture')).toBe(true);
		expect(isCommandType('contact.delete')).toBe(false);
		expect(isCommandType('toString')).toBe(false);
		expect(isCommandType(42)).toBe(false);
	});
});
