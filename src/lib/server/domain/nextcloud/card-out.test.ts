import { describe, expect, it } from 'bun:test';
import { readContactCards } from '../import/contact-cards';
import { stellaHash, writeCard, type PersonOnCard } from './card-out';

const lines = (...l: string[]) => l.join('\r\n') + '\r\n';

const base = lines(
	'BEGIN:VCARD',
	'VERSION:3.0',
	'PRODID:-//Sabre//Sabre VObject 4.5//EN',
	'UID:anna-1',
	'FN:Anna Muster',
	'N:Muster;Anna;Maria;Dr.;',
	'item1.TEL:+41 79 111 22 33',
	'item1.X-ABLABEL:Grosi',
	'TEL;TYPE=WORK:044 000 00 00',
	'EMAIL;TYPE=HOME:anna@example.com',
	'NOTE:Likes tea\\, not coffee',
	'CATEGORIES:Family',
	'BDAY:1950-04-07',
	'END:VCARD'
);

const anna: PersonOnCard = {
	firstName: 'Anna',
	lastName: 'Muster',
	displayName: 'Anna Muster',
	birthday: { value: '1950-04-07', precision: 'full' },
	phones: [{ value: '+41 79 111 22 33', label: { typed: 'Grosi' } }],
	emails: [{ value: 'anna@example.com', label: { known: 'home' } }],
	addresses: [],
	photoId: null
};

const read = (vcard: string) => readContactCards(vcard).cards[0]!;

describe('writing a person onto their card', () => {
	it('keeps what Stella does not hold and the lines it agrees with', () => {
		const out = writeCard(base, anna, null);
		expect(out).toContain('UID:anna-1\r\n');
		expect(out).toContain('NOTE:Likes tea\\, not coffee\r\n');
		expect(out).toContain('CATEGORIES:Family\r\n');
		expect(out).toContain('item1.TEL:+41 79 111 22 33\r\nitem1.X-ABLABEL:Grosi\r\n');
		expect(out).toContain('N:Muster;Anna;Maria;Dr.;\r\n');
		// The work number Stella no longer has is gone, label and all.
		expect(out).not.toContain('044 000');
		expect(out.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
		expect(out.endsWith('END:VCARD\r\n')).toBe(true);
	});

	it('reads back as the person it was written from', () => {
		const out = writeCard(
			base,
			{
				...anna,
				firstName: 'Anna-Lena',
				lastName: 'Muster; Meier',
				birthday: { value: '--04-07', precision: 'month_day' },
				phones: [...anna.phones, { value: '+41 79 999 00 00', label: { known: 'mobile' } }],
				emails: [{ value: 'neu@example.com', label: { typed: 'Verein, Chor' } }],
				addresses: [{ value: 'Dorfstrasse 1, 8000 Zürich', label: { known: 'home' } }]
			},
			null
		);
		const card = read(out);
		expect(card.firstName).toBe('Anna-Lena');
		expect(card.lastName).toBe('Muster; Meier');
		expect(card.birthday).toEqual({ value: '--04-07', precision: 'month_day' });
		expect(card.phones).toEqual([
			{ value: '+41 79 111 22 33', label: { typed: 'Grosi' } },
			{ value: '+41 79 999 00 00', label: { known: 'mobile' } }
		]);
		expect(card.emails).toEqual([{ value: 'neu@example.com', label: { typed: 'Verein, Chor' } }]);
		expect(card.addresses).toEqual([
			{ value: 'Dorfstrasse 1, 8000 Zürich', label: { known: 'home' } }
		]);
		expect(card.key).toBe('anna-1');
	});

	it('gives a new typed label a group no other line uses', () => {
		const out = writeCard(
			base,
			{
				...anna,
				emails: [{ value: 'x@example.com', label: { typed: 'Chor' } }]
			},
			null
		);
		expect(out).toContain('item2.EMAIL:x@example.com\r\nitem2.X-ABLABEL:Chor\r\n');
	});

	it('leaves a birthday Stella knows only by its year as the card has it', () => {
		const out = writeCard(base, { ...anna, birthday: { value: '1950', precision: 'year' } }, null);
		expect(out).toContain('BDAY:1950-04-07\r\n');
		expect(writeCard(base, { ...anna, birthday: null }, null)).toContain('BDAY:1950-04-07\r\n');
	});

	it('sends the photo in the syntax of the card’s version, folded', () => {
		const photo = { mime: 'image/jpeg', base64: 'A'.repeat(200) };
		const v3 = writeCard(base, { ...anna, photoId: 'p1' }, photo);
		expect(v3).toContain('PHOTO;ENCODING=b;TYPE=JPEG:AAAA');
		expect(v3.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
		expect(read(v3).photo).toBe('inline');

		const v4 = writeCard(
			base.replace('VERSION:3.0', 'VERSION:4.0'),
			{ ...anna, photoId: 'p1' },
			photo
		);
		expect(v4).toContain('PHOTO:data:image/jpeg;base64,AAAA');
		expect(read(v4).photo).toBe('inline');
	});

	it('keeps the card’s photo while Stella has none', () => {
		const withPhoto = base.replace('END:VCARD', 'PHOTO;ENCODING=b;TYPE=PNG:iVBOR\r\nEND:VCARD');
		expect(writeCard(withPhoto, anna, null)).toContain('PHOTO;ENCODING=b;TYPE=PNG:iVBOR\r\n');
	});

	it('folds without breaking a character in two', () => {
		const long = 'Ä'.repeat(60);
		const out = writeCard(base, { ...anna, firstName: long }, null);
		expect(out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
		expect(read(out).firstName).toBe(long);
	});
});

describe("a person's kept-in-step facts", () => {
	it('change their hash, and nothing else does', () => {
		const h = stellaHash(anna);
		expect(stellaHash({ ...anna })).toBe(h);
		expect(stellaHash({ ...anna, displayName: 'Grosi' })).toBe(h);
		expect(stellaHash({ ...anna, lastName: 'Meier' })).not.toBe(h);
		expect(stellaHash({ ...anna, phones: [] })).not.toBe(h);
		expect(stellaHash({ ...anna, photoId: 'p' })).not.toBe(h);
	});
});
