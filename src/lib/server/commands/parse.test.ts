import { describe, expect, it } from 'bun:test';
import { parseCommand, parsePhotoCommand } from './parse';

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

describe('parseCommand, for a note', () => {
	const note = { id: ID, type: 'note.add', payload: { contactId: 'julia', body: ' moving to @Bern ', visibility: 'private', isPinned: true }, issuedAt: 3 };

	it('reads a note on a person, trimming its text', () => {
		expect(parseCommand(note)?.payload).toEqual({ contactId: 'julia', body: 'moving to @Bern', visibility: 'private', isPinned: true });
	});

	it('refuses a note on nobody, or an empty one', () => {
		expect(parseCommand({ ...note, payload: { ...note.payload, contactId: '' } })).toBeNull();
		expect(parseCommand({ ...note, payload: { ...note.payload, body: ' ' } })).toBeNull();
	});
});

describe('parsePhotoCommand', () => {
	const bytes = new Uint8Array([1, 2, 3]);
	const photo = { id: ID, momentId: '01K6A5ZQ3V9W8X7Y6Z5A4B3C2E', image: bytes, thumb: bytes, width: 1600, height: 1200, issuedAt: 5 };

	it('reads a photo for a moment sent before it', () => {
		expect(parsePhotoCommand(photo)).toEqual({
			id: ID,
			type: 'moment.photo',
			payload: { momentId: photo.momentId, image: bytes, thumb: bytes, width: 1600, height: 1200 },
			issuedAt: 5
		});
	});

	it('refuses a photo with no moment, no bytes or no size', () => {
		expect(parsePhotoCommand({ ...photo, momentId: 'x' })).toBeNull();
		expect(parsePhotoCommand({ ...photo, image: 'bytes' })).toBeNull();
		expect(parsePhotoCommand({ ...photo, width: Number.NaN })).toBeNull();
		expect(parsePhotoCommand({ ...photo, id: '' })).toBeNull();
	});
});
