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

describe('parseCommand, for a call or visit', () => {
	const call = { id: ID, type: 'interaction.log', payload: { contactId: 'oma', kind: 'call', happenedAt: '2026-09-27' }, issuedAt: 3 };

	it('reads a call, filling in what the form may leave out', () => {
		expect(parseCommand(call)?.payload).toEqual({
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-09-27',
			title: null,
			description: null,
			visibility: 'shared',
			participantIds: []
		});
	});

	it('refuses an unknown kind or a day that is not one', () => {
		expect(parseCommand({ ...call, payload: { ...call.payload, kind: 'telegram' } })).toBeNull();
		expect(parseCommand({ ...call, payload: { ...call.payload, happenedAt: 'Sunday' } })).toBeNull();
	});
});

describe('parseCommand, for a tag or a circle', () => {
	it('reads a tag by name, with or without a colour, and refuses a colour it does not know', () => {
		const tag = { id: ID, type: 'tag.assign', payload: { contactId: 'julia', name: ' choir ' }, issuedAt: 3 };
		expect(parseCommand(tag)?.payload).toEqual({ contactId: 'julia', name: 'choir', color: null });
		expect(parseCommand({ ...tag, payload: { ...tag.payload, color: 'plaid' } })).toBeNull();
	});

	it('reads a circle by name, an empty role meaning none', () => {
		const join = { id: ID, type: 'circle.join', payload: { contactId: 'julia', circleName: 'Choir', role: ' ' }, issuedAt: 3 };
		expect(parseCommand(join)?.payload).toEqual({ contactId: 'julia', circleName: 'Choir', role: null });
		expect(parseCommand({ ...join, payload: { ...join.payload, circleName: '' } })).toBeNull();
	});
});

describe('parseCommand, for a relationship', () => {
	it('reads a link, empty specifics meaning none', () => {
		const link = { id: ID, type: 'relationship.add', payload: { contactId: 'anna', targetId: 'bert', typeChoice: 'reverse:parent_child', description: ' ', sinceDate: '' }, issuedAt: 3 };
		expect(parseCommand(link)?.payload).toEqual({
			contactId: 'anna',
			targetId: 'bert',
			typeChoice: 'reverse:parent_child',
			description: null,
			sinceDate: null,
			status: null
		});
		expect(parseCommand({ ...link, payload: { ...link.payload, targetId: '' } })).toBeNull();
	});
});

describe('parseCommand, for a new person', () => {
	const person = { id: ID, type: 'contact.add', payload: { firstName: ' Vesna ', lastName: '', birthDate: '1990-04-02' }, issuedAt: 3 };

	it('reads a new person, empty fields meaning none', () => {
		expect(parseCommand(person)?.payload).toEqual({
			firstName: 'Vesna',
			lastName: null,
			nickname: null,
			description: null,
			howWeMet: null,
			metPlace: null,
			birthDate: '1990-04-02',
			visibility: 'shared'
		});
	});

	it('refuses a person with no name at all', () => {
		expect(parseCommand({ ...person, payload: { firstName: ' ', nickname: '' } })).toBeNull();
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
