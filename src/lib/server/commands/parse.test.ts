import { describe, expect, it } from 'bun:test';
import { parseCommand } from './parse';

/*
 * Reading a command off the wire (docs/concepts/offline-capture.md §3). The outbox on a phone
 * sends JSON that may have been written by an older build, or tampered with; anything that is
 * not exactly a known command is refused as a whole rather than half-read.
 */

const ID = '01K6A5ZQ3V9W8X7Y6Z5A4B3C2D';
const good: { id: string; type: 'moment.capture'; payload: { body: string; entryDate: string; visibility: 'private'; newPeople: string[] }; issuedAt: number } = {
	id: ID,
	type: 'moment.capture',
	payload: { body: '  Coffee with @Julia  ', entryDate: '2026-09-27', visibility: 'private', newPeople: ['Vesna'] },
	issuedAt: 1_700_000_000_000
};

describe('parseCommand', () => {
	it('reads a moment, trimming its text', () => {
		expect(parseCommand(good)).toEqual({
			...good,
			payload: { ...good.payload, body: 'Coffee with @Julia' }
		});
	});

	it('defaults a moment to shared and to nobody new, as the form does', () => {
		const parsed = parseCommand({ ...good, payload: { body: 'x @Julia', entryDate: '2026-09-27' } });
		expect(parsed?.payload).toEqual({ body: 'x @Julia', entryDate: '2026-09-27', visibility: 'shared', newPeople: [] });
	});

	it('refuses what is not exactly a known command', () => {
		expect(parseCommand(null)).toBeNull();
		expect(parseCommand({ ...good, type: 'contact.delete' })).toBeNull();
		expect(parseCommand({ ...good, id: 'not-an-id' })).toBeNull();
		expect(parseCommand({ ...good, issuedAt: 'yesterday' })).toBeNull();
		expect(parseCommand({ ...good, payload: { ...good.payload, body: '   ' } })).toBeNull();
		expect(parseCommand({ ...good, payload: { ...good.payload, entryDate: '27.09.2026' } })).toBeNull();
		expect(parseCommand({ ...good, payload: { ...good.payload, visibility: 'public' } })).toBeNull();
	});
});
