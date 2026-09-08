import { describe, expect, it } from 'bun:test';
import { readVCard, VCardError } from './vcard';

/*
 * Reading a vCard into the importer's typed view (docs/02 §2.16). A vCard is contacts only,
 * and it is the one accepted format Monica did not write — so the tests here are about the
 * format's own quirks: folded lines, escaped text, structured values and inline pictures.
 */

const card = (...lines: string[]) => ['BEGIN:VCARD', 'VERSION:4.0', ...lines, 'END:VCARD'].join('\r\n');

describe('readVCard', () => {
	it('reads the name a card carries and derives nothing it was not given', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin Hauenstein', 'N:Hauenstein;Severin;;;'));

		expect(exp.source).toBe('vcard');
		expect(exp.contacts).toHaveLength(1);
		expect(exp.contacts[0]).toMatchObject({
			id: 'u1',
			firstName: 'Severin',
			lastName: 'Hauenstein',
			nickname: null,
			company: null
		});
	});

	it('joins a folded line back together before reading it', () => {
		const exp = readVCard(
			// Folding drops the one space it inserted, so a card may break mid-word (RFC 6350 §3.2).
			['BEGIN:VCARD', 'VERSION:3.0', 'UID:u1', 'FN:Severin', 'NOTE:He keeps the Jassr', ' unde going', 'END:VCARD'].join('\r\n')
		);

		expect(exp.notes[0]?.body).toBe('He keeps the Jassrunde going');
	});

	it('unescapes the text a card escaped, and keeps a real comma out of the split', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'NOTE:First line\\nSecond\\, with a comma\; and a semicolon'));

		expect(exp.notes[0]?.body).toBe('First line\nSecond, with a comma; and a semicolon');
	});

	it('takes the middle name into the given name, the way the mapping expects', () => {
		const exp = readVCard(card('UID:u1', 'FN:Marlis A. Hauenstein', 'N:Hauenstein;Marlis;Anna;;'));

		expect(exp.contacts[0]?.firstName).toBe('Marlis');
		expect(exp.contacts[0]?.middleName).toBe('Anna');
	});

	it('falls back to the formatted name when the card has no structured one', () => {
		const exp = readVCard(card('UID:u1', 'FN:Jassrunde Bern'));

		expect(exp.contacts[0]?.firstName).toBe('Jassrunde Bern');
		expect(exp.contacts[0]?.lastName).toBeNull();
	});

	it('reads a full birthday, and a birthday whose year the card withholds', () => {
		const exp = readVCard(
			[card('UID:u1', 'FN:Severin', 'BDAY:19790411'), card('UID:u2', 'FN:Marlis', 'BDAY:--0407')].join('\r\n')
		);

		const [severin, marlis] = exp.specialDates;
		expect(severin).toMatchObject({ date: '1979-04-11', isYearUnknown: false, isAgeBased: false });
		expect(marlis).toMatchObject({ date: '0000-04-07', isYearUnknown: true });
		expect(exp.contacts[0]?.birthdaySpecialDateId).toBe(severin!.id);
	});

	it('ignores a birthday that is not a date at all rather than storing nonsense', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'BDAY:circa 1979'));

		expect(exp.specialDates).toHaveLength(0);
		expect(exp.contacts[0]?.birthdaySpecialDateId).toBeNull();
	});

	it('keeps every way of reaching someone, each as the kind of field it is', () => {
		const exp = readVCard(
			card(
				'UID:u1',
				'FN:Severin',
				'EMAIL;TYPE=work:severin@example.ch',
				'TEL;TYPE="voice,cell":+41 79 000 00 00',
				'URL:https://hauenstein.example.ch'
			)
		);

		const kinds = exp.contactFieldTypes;
		const typeOf = (typeId: string | number) => kinds.find((t) => t.id === typeId)?.type;
		expect(exp.contactFields.map((f) => [typeOf(f.typeId), f.data])).toEqual([
			['email', 'severin@example.ch'],
			['phone', '+41 79 000 00 00'],
			['url', 'https://hauenstein.example.ch']
		]);
	});

	it('reads a structured address into its parts, the label coming from the card type', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'ADR;TYPE=home:;;Bahnhofstrasse 3;Bern;BE;3011;Switzerland'));

		expect(exp.addresses[0]).toMatchObject({
			contactId: 'u1',
			name: 'home',
			street: 'Bahnhofstrasse 3',
			city: 'Bern',
			province: 'BE',
			postalCode: '3011',
			country: 'Switzerland'
		});
	});

	it('reads the job and the company out of one ORG line and TITLE', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'ORG:Kantonsspital;Radiologie', 'TITLE:Oberarzt'));

		expect(exp.contacts[0]).toMatchObject({ company: 'Kantonsspital', job: 'Oberarzt' });
	});

	it('collects the categories of every card into shared tags', () => {
		const exp = readVCard(
			[
				card('UID:u1', 'FN:Severin', 'CATEGORIES:Jassrunde,Nachbarn'),
				card('UID:u2', 'FN:Marlis', 'CATEGORIES:Jassrunde')
			].join('\r\n')
		);

		expect(exp.tags.map((t) => [t.name, t.contactIds])).toEqual([
			['Jassrunde', ['u1', 'u2']],
			['Nachbarn', ['u1']]
		]);
	});

	it('carries an inline picture as a data URL and makes it the avatar', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'PHOTO;ENCODING=b;TYPE=JPEG:AAECAw=='));

		expect(exp.photos[0]).toMatchObject({
			contactId: 'u1',
			mime: 'image/jpeg',
			dataUrl: 'data:image/jpeg;base64,AAECAw==',
			sizeBytes: 4
		});
		expect(exp.contacts[0]).toMatchObject({ avatarSource: 'photo', avatarPhotoId: exp.photos[0]!.id });
	});

	it('reads a vCard 4 picture that is already a data URL', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'PHOTO:data:image/png;base64,AAECAw=='));

		expect(exp.photos[0]).toMatchObject({ mime: 'image/png', dataUrl: 'data:image/png;base64,AAECAw==' });
	});

	it('leaves out a picture the card only links to, since the file is not in it', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'PHOTO;VALUE=uri:https://example.ch/severin.jpg'));

		expect(exp.photos).toHaveLength(0);
	});

	it('gives a card without a UID an id of its own, so two such cards stay two people', () => {
		const exp = readVCard([card('FN:Severin'), card('FN:Marlis')].join('\r\n'));

		const ids = exp.contacts.map((c) => c.id);
		expect(new Set(ids).size).toBe(2);
	});

	it('keys a card without a UID by what is on it, not by where it sits in the file', () => {
		const severin = card('FN:Severin', 'EMAIL:severin@example.ch');
		const alone = readVCard(severin).contacts[0]!.id;
		// The same card, now second in a different file: it is the same person, so the same id.
		const second = readVCard([card('FN:Marlis'), severin].join('\r\n')).contacts[1]!.id;

		expect(second).toBe(alone);
		// The positive control: a different card must not land on that id.
		expect(readVCard(card('FN:Marlis')).contacts[0]!.id).not.toBe(alone);
	});

	it('reads a vCard 2.1 line encoded as quoted-printable, soft line breaks included', () => {
		const exp = readVCard(
			[
				'BEGIN:VCARD',
				'VERSION:2.1',
				'UID:u1',
				'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Hauenstein;Ren=C3=A9;;;',
				'FN:Rene Hauenstein',
				// 2.1 continues a soft-broken line at column one, not indented like RFC 6350 does.
				'NOTE;ENCODING=QUOTED-PRINTABLE:Traf ihn in Z=C3=BCrich, an einem =',
				'sehr langen Tag.',
				'END:VCARD'
			].join('\r\n')
		);

		expect(exp.contacts[0]?.firstName).toBe('René');
		expect(exp.notes[0]?.body).toBe('Traf ihn in Zürich, an einem sehr langen Tag.');
	});

	it('keeps a semicolon a parameter put in quotes out of the parameter split', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'ADR;TYPE="home;postal":;;Bahnhofstrasse 3;Bern;;3011;'));

		expect(exp.addresses[0]).toMatchObject({ name: 'home;postal', street: 'Bahnhofstrasse 3' });
	});

	it('keys a card whose UID would not survive a URL by its contents instead', () => {
		// The id ends up in /contacts/<id> and /media/<id>; a slash or hash there is not a name.
		const exp = readVCard([card('UID:with/slash', 'FN:Severin'), card('UID:with#hash', 'FN:Marlis')].join('\r\n'));

		const ids = exp.contacts.map((c) => String(c.id));
		expect(ids.every((id) => /^[A-Za-z0-9._~:@+-]+$/.test(id))).toBe(true);
		expect(new Set(ids).size).toBe(2);
	});

	it('gives every id it mints a shape a URL can carry', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'NOTE:x', 'EMAIL:a@b.ch', 'PHOTO:data:image/png;base64,AAECAw=='));

		const urlSafe = /^[A-Za-z0-9._~:@+-]+$/;
		expect(String(exp.photos[0]!.id)).toMatch(urlSafe);
		expect(String(exp.notes[0]!.id)).toMatch(urlSafe);
		expect(String(exp.contactFields[0]!.id)).toMatch(urlSafe);
	});

	it('strips the urn:uuid a card puts in front of its UID', () => {
		const exp = readVCard(card('UID:urn:uuid:0a1b2c3d', 'FN:Severin'));

		expect(exp.contacts[0]?.id).toBe('0a1b2c3d');
	});

	it('drops a property group prefix, which says nothing about what the property is', () => {
		const exp = readVCard(card('UID:u1', 'FN:Severin', 'item1.EMAIL:severin@example.ch'));

		expect(exp.contactFields[0]?.data).toBe('severin@example.ch');
	});

	it('says plainly when the file is not a vCard', () => {
		expect(() => readVCard('Dear Severin, ...')).toThrow(VCardError);
	});

	it('says so when a card is opened and never closed', () => {
		expect(() => readVCard('BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Severin')).toThrow(VCardError);
	});

	it('refuses a card that names nobody, rather than importing a nameless person', () => {
		expect(() => readVCard(card('UID:u1', 'NOTE:no name here'))).toThrow(VCardError);
	});
});
