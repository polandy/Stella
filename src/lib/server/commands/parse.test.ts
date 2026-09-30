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

	it('reads a person created with a moment, name and description with it', () => {
		const parsed = parseCommand({
			...good,
			payload: {
				...good.payload,
				newPeople: ['Vesna', { key: 'k1', firstName: ' Thomas ', lastName: '', description: ' Hut guide ' }]
			}
		});
		expect(parsed?.payload).toMatchObject({
			newPeople: ['Vesna', { key: 'k1', firstName: 'Thomas', lastName: null, description: 'Hut guide' }]
		});
		const nameless = { key: 'k1', firstName: '  ', lastName: null, description: null };
		expect(parseCommand({ ...good, payload: { ...good.payload, newPeople: [nameless] } })).toBeNull();
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
			gender: null,
			visibility: 'shared'
		});
	});

	it('reads the gender chosen for them, one of the three', () => {
		expect(parseCommand({ ...person, payload: { ...person.payload, gender: 'diverse' } })?.payload).toMatchObject({
			gender: 'diverse'
		});
	});

	it('refuses a gender that is not one of the three, rather than dropping it', () => {
		expect(parseCommand({ ...person, payload: { ...person.payload, gender: 'other' } })).toBeNull();
	});

	it('refuses a person with no name at all', () => {
		expect(parseCommand({ ...person, payload: { firstName: ' ', nickname: '' } })).toBeNull();
	});
});

describe('parseCommand, for a journal-page entry', () => {
	const entry = { id: ID, type: 'journal.write', payload: { contactId: 'julia', entryDate: '2026-09-27', title: ' Lake ', body: ' Swam ' }, issuedAt: 3 };

	it('reads an entry, trimming it, an empty title meaning none and shared by default', () => {
		expect(parseCommand(entry)?.payload).toEqual({ contactId: 'julia', entryDate: '2026-09-27', title: 'Lake', body: 'Swam', visibility: 'shared' });
		expect(parseCommand({ ...entry, payload: { ...entry.payload, title: '  ' } })?.payload).toMatchObject({ title: null });
	});

	it('refuses an empty entry, or one on no day', () => {
		expect(parseCommand({ ...entry, payload: { ...entry.payload, body: ' ' } })).toBeNull();
		expect(parseCommand({ ...entry, payload: { ...entry.payload, entryDate: 'today' } })).toBeNull();
	});
});

describe('parseCommand, for a field or a date', () => {
	const field = { id: ID, type: 'field.add', payload: { contactId: 'julia', kind: 'phone', label: '', value: ' 079 123 ' }, issuedAt: 3 };
	const date = { id: ID, type: 'date.add', payload: { contactId: 'julia', kind: 'anniversary', date: '--06-12' }, issuedAt: 3 };

	it('reads a field, trimming its value, an empty label meaning none', () => {
		expect(parseCommand(field)?.payload).toEqual({ contactId: 'julia', kind: 'phone', label: null, value: '079 123' });
	});

	it('refuses a field of an unknown kind, or with no value', () => {
		expect(parseCommand({ ...field, payload: { ...field.payload, kind: 'fax' } })).toBeNull();
		expect(parseCommand({ ...field, payload: { ...field.payload, value: ' ' } })).toBeNull();
	});

	it('reads a date, yearly and remembered unless the form says otherwise', () => {
		expect(parseCommand(date)?.payload).toEqual({
			contactId: 'julia',
			kind: 'anniversary',
			label: null,
			date: '--06-12',
			recursYearly: true,
			remind: true
		});
		expect(parseCommand({ ...date, payload: { ...date.payload, recursYearly: false, remind: false } })?.payload).toMatchObject({
			recursYearly: false,
			remind: false
		});
	});

	it('refuses a date of an unknown kind, or with no day', () => {
		expect(parseCommand({ ...date, payload: { ...date.payload, kind: 'nameday' } })).toBeNull();
		expect(parseCommand({ ...date, payload: { ...date.payload, date: '' } })).toBeNull();
	});
});

describe('parseCommand, for a gallery upload', () => {
	const gallery = { id: ID, type: 'gallery.add', payload: { contactId: 'julia' }, issuedAt: 3 };

	it('reads the person the photos go to, shared by default', () => {
		expect(parseCommand(gallery)?.payload).toEqual({ contactId: 'julia', visibility: 'shared' });
	});

	it('refuses an upload for nobody', () => {
		expect(parseCommand({ ...gallery, payload: { contactId: '' } })).toBeNull();
	});
});

describe('parsePhotoCommand', () => {
	const bytes = new Uint8Array([1, 2, 3]);
	const photo = {
		id: ID,
		type: 'moment.photo',
		parentId: '01K6A5ZQ3V9W8X7Y6Z5A4B3C2E',
		image: bytes,
		thumb: bytes,
		width: 1600,
		height: 1200,
		issuedAt: 5
	};

	it('reads a photo for the entry sent before it', () => {
		expect(parsePhotoCommand(photo)).toEqual({
			id: ID,
			type: 'moment.photo',
			payload: { parentId: photo.parentId, image: bytes, thumb: bytes, width: 1600, height: 1200 },
			issuedAt: 5
		});
	});

	it('reads a photo for a gallery upload sent before it', () => {
		expect(parsePhotoCommand({ ...photo, type: 'gallery.photo' })?.type).toBe('gallery.photo');
	});

	it('refuses a photo of no known type, with no parent, no bytes or no size', () => {
		expect(parsePhotoCommand({ ...photo, type: 'note.add' })).toBeNull();
		expect(parsePhotoCommand({ ...photo, type: null })).toBeNull();
		expect(parsePhotoCommand({ ...photo, parentId: 'x' })).toBeNull();
		expect(parsePhotoCommand({ ...photo, image: 'bytes' })).toBeNull();
		expect(parsePhotoCommand({ ...photo, width: Number.NaN })).toBeNull();
		expect(parsePhotoCommand({ ...photo, id: '' })).toBeNull();
	});
});
