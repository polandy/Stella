import { describe, expect, it } from 'bun:test';
import { COMMAND_TYPES, isCommandType, isQueueable, kindOf, photoCommandFor } from './commands';

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

	it('names writing on the journal page, a field, a date and a gallery upload as additions', () => {
		for (const type of [
			'journal.write',
			'field.add',
			'date.add',
			'gallery.add',
			'gallery.photo',
			'circleGallery.add',
			'circleGallery.photo'
		] as const) {
			expect(kindOf(type)).toBe('add');
		}
	});

	it('recognises its own types and nothing else', () => {
		expect(isCommandType('moment.capture')).toBe(true);
		expect(isCommandType('contact.delete')).toBe(false);
		expect(isCommandType('toString')).toBe(false);
		expect(isCommandType(42)).toBe(false);
	});
});

describe('photoCommandFor', () => {
	it('sends a photo kept with a journal entry — a moment or a page entry — onto that entry', () => {
		expect(photoCommandFor('moment.capture')).toBe('moment.photo');
		expect(photoCommandFor('journal.write')).toBe('moment.photo');
	});

	it('sends a photo kept for a gallery into that person’s gallery', () => {
		expect(photoCommandFor('gallery.add')).toBe('gallery.photo');
	});

	it('sends a photo kept for a circle into that circle’s photos', () => {
		expect(photoCommandFor('circleGallery.add')).toBe('circleGallery.photo');
	});

	it('names no photo command for what cannot carry photos', () => {
		expect(photoCommandFor('note.add')).toBeNull();
		expect(photoCommandFor('contact.add')).toBeNull();
	});
});
