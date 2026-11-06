import { describe, expect, it } from 'bun:test';
import { inEnglish, phrase } from '../../../i18n/phrase';
import type { MessageKey, MessageParams } from '../../../i18n/translate';
import {
	cardFingerprint,
	fingerprint,
	orNull,
	parseDay,
	parseLine,
	readAddress,
	readCategories,
	readName,
	readPhoto,
	splitCards,
	splitEscaped,
	unescape,
	unfold,
	VCardError,
	type Property
} from './vcard-lines';

/*
 * The vCard format itself (docs/02 §2.16): content lines, folding, escapes, parameters and
 * cards. Both readers stand on it, and an export from another app is the one input Stella does
 * not control, so malformed lines are tested as hard as well-formed ones.
 */

/** A content line that must parse; a test that hands one in never expects null. */
const line = (text: string): Property => {
	const property = parseLine(text);
	if (!property) throw new Error(`not a content line: ${text}`);
	return property;
};

const card = (...lines: string[]): Property[] => lines.map(line);

/** A message in English. */
const english = <K extends MessageKey>(key: K, ...params: MessageParams<K>) =>
	inEnglish(phrase(key, ...params));

/** The English message a vCard error carries, to tell its phrases apart. */
const messageOf = (run: () => unknown): string => {
	try {
		run();
	} catch (error) {
		if (error instanceof VCardError) return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a VCardError');
};

describe('unfold', () => {
	it('splits on CRLF, LF and a bare CR alike', () => {
		expect(unfold('A:1\r\nB:2\nC:3\rD:4')).toEqual(['A:1', 'B:2', 'C:3', 'D:4']);
	});

	it('joins a line starting with a space or a tab to the one before, dropping that one character', () => {
		expect(unfold('NOTE:Jass\r\n runde\r\n\t going')).toEqual(['NOTE:Jassrunde going']);
	});

	it('keeps a second leading space, which is part of the text', () => {
		expect(unfold('NOTE:two\r\n  words')).toEqual(['NOTE:two words']);
	});

	it('joins a quoted-printable soft break with the line after it', () => {
		expect(unfold('NOTE;ENCODING=QUOTED-PRINTABLE:Gr=C3=BC=\r\n=C3=9Fe\r\nFN:x')).toEqual([
			'NOTE;ENCODING=QUOTED-PRINTABLE:Gr=C3=BC=C3=9Fe',
			'FN:x'
		]);
	});

	it('leaves a trailing = alone on a line that is not quoted-printable', () => {
		expect(unfold('NOTE:a=\r\nFN:b')).toEqual(['NOTE:a=', 'FN:b']);
	});

	it('drops blank lines', () => {
		expect(unfold('\r\nA:1\r\n\r\n\nB:2\r\n')).toEqual(['A:1', 'B:2']);
	});
});

describe('splitEscaped', () => {
	it('splits on the separator and keeps an escaped one, still escaped, in its part', () => {
		expect(splitEscaped('Smith\\;Jones;Anna;;', ';')).toEqual(['Smith\\;Jones', 'Anna', '', '']);
	});

	it('keeps an escaped backslash from escaping the separator after it', () => {
		expect(splitEscaped('a\\\\;b', ';')).toEqual(['a\\\\', 'b']);
	});

	it('keeps a backslash at the very end as it is', () => {
		expect(splitEscaped('a\\', ';')).toEqual(['a\\']);
	});

	it('gives one empty part for an empty value', () => {
		expect(splitEscaped('', ',')).toEqual(['']);
	});
});

describe('unescape', () => {
	it('turns \\n and \\N into a line break and keeps an escaped comma, semicolon and backslash', () => {
		expect(unescape('a\\nb\\Nc\\, d\\; e\\\\f')).toBe('a\nb\nc, d; e\\f');
	});

	it('leaves a backslash before any other character as it is', () => {
		expect(unescape('C:\\temp')).toBe('C:\\temp');
	});
});

describe('parseLine', () => {
	it('reads the name in upper case and the value after the first colon, untouched', () => {
		expect(line('url:https://example.org/a:b')).toMatchObject({
			group: null,
			name: 'URL',
			raw: 'https://example.org/a:b'
		});
	});

	it('reads the group that ties a label to its value, in lower case', () => {
		expect(line('ITEM1.EMAIL;TYPE=INTERNET:x@example.org')).toMatchObject({
			group: 'item1',
			name: 'EMAIL'
		});
	});

	it('keeps every value of a parameter named twice or listed with commas', () => {
		const { params } = line('TEL;TYPE=cell,voice;type=HOME:+41 79');
		expect(params.get('TYPE')).toEqual(['cell', 'voice', 'HOME']);
	});

	it('keeps a semicolon and a colon inside a quoted parameter value', () => {
		const property = line('ADR;TYPE="home;postal";LABEL="Floor 2: left":;;Main St 1');
		expect(property.params.get('TYPE')).toEqual(['home;postal']);
		expect(property.params.get('LABEL')).toEqual(['Floor 2: left']);
		expect(property.raw).toBe(';;Main St 1');
	});

	it('keys a bare vCard 2.1 parameter by itself', () => {
		expect(line('TEL;CELL:+41 79').params.get('CELL')).toEqual(['CELL']);
	});

	it('drops an empty parameter value', () => {
		expect(line('EMAIL;TYPE=:x@example.org').params.get('TYPE')).toEqual([]);
	});

	it('decodes a quoted-printable value as UTF-8, upper or lower hex', () => {
		expect(line('NOTE;ENCODING=QUOTED-PRINTABLE:Gr=C3=BC=c3=9Fe').raw).toBe('Grüße');
	});

	it('keeps an = that does not start a hex pair in a quoted-printable value', () => {
		expect(line('NOTE;ENCODING=QUOTED-PRINTABLE:a=ZZb=').raw).toBe('a=ZZb=');
	});

	it('is null for a line with no colon outside quotes', () => {
		expect(parseLine('NOTE without a value')).toBeNull();
		expect(parseLine('X;LABEL="a:b"')).toBeNull();
	});
});

describe('splitCards', () => {
	it('reads each card between BEGIN and END, in any case, and skips what lies outside', () => {
		const cards = splitCards(
			[
				'a preamble line',
				'begin:vcard',
				'FN:One',
				'end:vcard',
				'BEGIN:VCARD',
				'FN:Two',
				'not a content line',
				'END:VCARD',
				''
			].join('\r\n')
		);
		expect(cards.map((c) => c.map((p) => p.raw))).toEqual([['One'], ['Two']]);
	});

	it('refuses a card that opens before the last one closed', () => {
		expect(messageOf(() => splitCards('BEGIN:VCARD\nBEGIN:VCARD\nEND:VCARD'))).toBe(
			english('import.error.vcardOverlap')
		);
	});

	it('refuses an END with no card open', () => {
		expect(messageOf(() => splitCards('END:VCARD'))).toBe(
			english('import.error.vcardEndWithoutBegin')
		);
	});

	it('refuses a card that never closes', () => {
		expect(messageOf(() => splitCards('BEGIN:VCARD\nFN:x'))).toBe(
			english('import.error.vcardUnclosed')
		);
	});

	it('refuses a file with no card at all', () => {
		expect(messageOf(() => splitCards(''))).toBe(english('import.error.notVcard'));
		expect(messageOf(() => splitCards('Dear Severin,'))).toBe(english('import.error.notVcard'));
	});
});

describe('fingerprint', () => {
	it('is the two FNV-1a offset bases for no text at all', () => {
		expect(fingerprint('')).toBe('811c9dc59dc5811c');
	});

	it('is sixteen hex characters, the same for the same text and different for other text', () => {
		expect(fingerprint('Severin')).toMatch(/^[0-9a-f]{16}$/);
		expect(fingerprint('Severin')).toBe(fingerprint('Severin'));
		expect(fingerprint('Severin')).not.toBe(fingerprint('severin'));
	});

	it('of a card follows its properties’ names and values, in order', () => {
		const a = card('FN:A', 'TEL:1');
		expect(cardFingerprint(a)).toBe(cardFingerprint(card('FN:A', 'TEL:1')));
		expect(cardFingerprint(a)).not.toBe(cardFingerprint(card('TEL:1', 'FN:A')));
		expect(cardFingerprint(a)).not.toBe(cardFingerprint(card('FN:A', 'TEL:2')));
	});
});

describe('orNull', () => {
	it('trims a value and is null for nothing left', () => {
		expect(orNull(' Anna ')).toBe('Anna');
		expect(orNull('   ')).toBeNull();
		expect(orNull(undefined)).toBeNull();
	});
});

describe('readName', () => {
	it('reads the structured name, unescaped, and keeps the formatted one beside it', () => {
		expect(readName(card('FN:John Smith', 'N:Smith\\, Jr.;John;Quincy;;'), 0)).toEqual({
			firstName: 'John',
			middleName: 'Quincy',
			lastName: 'Smith, Jr.',
			formatted: 'John Smith'
		});
	});

	it('takes the formatted name as the given name when there is no structured one', () => {
		expect(readName(card('FN:Cher'), 0)).toMatchObject({ firstName: 'Cher', lastName: null });
	});

	it('leaves the given name empty when the structured name has only a family name', () => {
		expect(readName(card('FN:Dr. Smith', 'N:Smith;;;;'), 0)).toMatchObject({
			firstName: null,
			lastName: 'Smith'
		});
	});

	it('names a card that names nobody by its company, then its email, then its number', () => {
		const firstOf = (...lines: string[]) => readName(card(...lines), 0).firstName;
		expect(firstOf('ORG:Acme\\, Inc.;Sales', 'EMAIL:a@x.org', 'TEL:1')).toBe('Acme, Inc.');
		expect(firstOf('EMAIL:a@x.org', 'TEL:1')).toBe('a@x.org');
		expect(firstOf('TEL:+41 79')).toBe('+41 79');
	});

	it('refuses a card with nothing to call it by, naming its place in the file', () => {
		expect(messageOf(() => readName(card('FN: ', 'NOTE:hello'), 2))).toBe(
			inEnglish(phrase('import.error.vcardNameless', { index: 3 }))
		);
	});
});

describe('parseDay', () => {
	it('reads a day with or without dashes, and drops a time', () => {
		const day = { date: '1990-04-07', isYearUnknown: false };
		expect(parseDay('1990-04-07')).toEqual(day);
		expect(parseDay('19900407')).toEqual(day);
		expect(parseDay(' 1990-04-07T10:30:00Z ')).toEqual(day);
	});

	it('reads a day that withholds its year', () => {
		const day = { date: '0000-04-07', isYearUnknown: true };
		expect(parseDay('--0407')).toEqual(day);
		expect(parseDay('--04-07')).toEqual(day);
	});

	it('keeps 29 February without a year, as any leap year has it', () => {
		expect(parseDay('--0229')).toEqual({ date: '0000-02-29', isYearUnknown: true });
	});

	it('is null for free text or a day missing its padding', () => {
		expect(parseDay('April 7th')).toBeNull();
		expect(parseDay('1990-4-7')).toBeNull();
		expect(parseDay('')).toBeNull();
	});

	it('is null for a day no calendar has', () => {
		expect(parseDay('1990-13-45')).toBeNull();
		expect(parseDay('1990-02-29')).toBeNull();
		expect(parseDay('--0230')).toBeNull();
		expect(parseDay('1990-00-10')).toBeNull();
	});
});

describe('readAddress', () => {
	it('reads the parts of an ADR, the extended line after the street', () => {
		expect(readAddress(line('ADR:PO 9;Apt 4;Main St 1;Bern;BE;3000;Switzerland'))).toEqual({
			street: 'Main St 1, Apt 4',
			city: 'Bern',
			province: 'BE',
			postalCode: '3000',
			country: 'Switzerland'
		});
	});

	it('unescapes each part and leaves the missing ones null', () => {
		expect(readAddress(line('ADR:;;Main St\\, 1;Bern'))).toEqual({
			street: 'Main St, 1',
			city: 'Bern',
			province: null,
			postalCode: null,
			country: null
		});
	});
});

describe('readCategories', () => {
	it('reads every CATEGORIES line, each name once, trimmed and unescaped', () => {
		expect(
			readCategories(card('CATEGORIES:Family, Work,,', 'CATEGORIES:Work,Rock\\, Paper', 'FN:x'))
		).toEqual(['Family', 'Work', 'Rock, Paper']);
	});

	it('is empty for a card in no category', () => {
		expect(readCategories(card('FN:x'))).toEqual([]);
	});
});

describe('readPhoto', () => {
	const photo = (text: string) => readPhoto(line(text), 'p1', 'c1');

	it('reads a data URI, with its type and the size its payload decodes to', () => {
		expect(photo('PHOTO:data:image/png;base64,iVBORw0KGgo=')).toEqual({
			id: 'p1',
			path: 'p1.bin',
			dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
			mime: 'image/png',
			sizeBytes: 8,
			contactId: 'c1',
			createdAt: null
		});
	});

	it('reads a data URI whose comma Nextcloud escaped', () => {
		expect(photo('PHOTO:data:image/jpeg;base64\\,AAAA')).toMatchObject({
			dataUrl: 'data:image/jpeg;base64,AAAA',
			sizeBytes: 3
		});
	});

	it('takes a JPEG for a data URI that names no type', () => {
		expect(photo('PHOTO:data:;base64,AAAA')?.mime).toBe('image/jpeg');
	});

	it('reads inline base64 from vCard 3.0 and 2.1, its type in either spelling', () => {
		expect(photo('PHOTO;ENCODING=b;TYPE=JPEG:AAAA')).toMatchObject({
			dataUrl: 'data:image/jpeg;base64,AAAA',
			mime: 'image/jpeg',
			sizeBytes: 3
		});
		expect(photo('PHOTO;ENCODING=BASE64;TYPE=PNG:AA==')).toMatchObject({
			mime: 'image/png',
			sizeBytes: 1
		});
		expect(photo('PHOTO;ENCODING=b;TYPE=image/gif:AAAA')?.mime).toBe('image/gif');
		expect(photo('PHOTO;ENCODING=b:AAAA')?.mime).toBe('image/jpeg');
	});

	it('is null for a picture the card only points at', () => {
		expect(photo('PHOTO;VALUE=uri:https://example.org/me.jpg')).toBeNull();
	});
});
