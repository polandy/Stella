import { describe, expect, it } from 'bun:test';
import {
	giftFromMonica,
	giftFromMonicaNote,
	giftsFromTouchpoint,
	monicaGiftState,
	parseMonicaGiftNote,
	parseNoteDay
} from './conversion';

/*
 * Gifts Stella already held in other shapes become gift records (docs/02 §2.25.4): the notes
 * the Monica import wrote, and the touchpoints of the dropped kind *gift*. Pure, so the startup
 * job, the restore and the importer decide the same way — and nothing written by hand is lost.
 */

describe('monicaGiftState', () => {
	it("maps Monica's three statuses onto the gift's states", () => {
		expect(monicaGiftState('idea')).toBe('idea');
		expect(monicaGiftState('offered')).toBe('given');
		expect(monicaGiftState('received')).toBe('received');
	});

	it('reads the status as Monica wrote it, whatever its case', () => {
		expect(monicaGiftState(' Offered ')).toBe('given');
	});

	it('knows no other status', () => {
		expect(monicaGiftState('bought')).toBeNull();
		expect(monicaGiftState(null)).toBeNull();
	});
});

describe('parseNoteDay', () => {
	it('reads the day the import wrote in English', () => {
		expect(parseNoteDay('12 October 2023')).toBe('2023-10-12');
		expect(parseNoteDay('1 March 2020')).toBe('2020-03-01');
	});

	it('reads the day the import wrote in German', () => {
		expect(parseNoteDay('12. Oktober 2023')).toBe('2023-10-12');
		expect(parseNoteDay('3. März 2021')).toBe('2021-03-03');
	});

	it('reads an ISO day', () => {
		expect(parseNoteDay('2023-10-12')).toBe('2023-10-12');
	});

	it('refuses a day without a year, an unknown month and a day that does not exist', () => {
		expect(parseNoteDay('12 October')).toBeNull();
		expect(parseNoteDay('12 Octember 2023')).toBeNull();
		expect(parseNoteDay('31 February 2023')).toBeNull();
		expect(parseNoteDay('soon')).toBeNull();
	});
});

describe('giftFromMonica', () => {
	const base = { name: 'Teapot', status: 'idea', day: null, comment: null, url: null };

	it('keeps an idea without a day', () => {
		expect(giftFromMonica(base)).toEqual({
			ok: true,
			gift: { state: 'idea', title: 'Teapot', givenOn: null, note: null, url: null }
		});
	});

	it('gives an offered gift its day, and keeps the comment as the note', () => {
		const result = giftFromMonica({
			...base,
			status: 'offered',
			day: '2023-10-12',
			comment: 'Cast iron'
		});
		expect(result).toEqual({
			ok: true,
			gift: { state: 'given', title: 'Teapot', givenOn: '2023-10-12', note: 'Cast iron', url: null }
		});
	});

	it('drops the day of an idea, which has none', () => {
		const result = giftFromMonica({ ...base, day: '2023-10-12' });
		expect(result.ok && result.gift.givenOn).toBeNull();
	});

	it('keeps a web address as the link, read the way gift links are', () => {
		const result = giftFromMonica({ ...base, url: 'shop.example/teapot' });
		expect(result.ok && result.gift.url).toBe('https://shop.example/teapot');
	});

	it('keeps a link that is no web address in the note, so nothing is lost', () => {
		const result = giftFromMonica({ ...base, comment: 'Cast iron', url: 'javascript:alert(1)' });
		expect(result).toEqual({
			ok: true,
			gift: {
				state: 'idea',
				title: 'Teapot',
				givenOn: null,
				note: 'Cast iron\n\njavascript:alert(1)',
				url: null
			}
		});
	});

	it('refuses a given or received gift without its day', () => {
		expect(giftFromMonica({ ...base, status: 'offered' })).toEqual({ ok: false, reason: 'noDay' });
		expect(giftFromMonica({ ...base, status: 'received' })).toEqual({
			ok: false,
			reason: 'noDay'
		});
	});

	it('refuses an unknown status and a gift without a name', () => {
		expect(giftFromMonica({ ...base, status: 'bought' })).toEqual({
			ok: false,
			reason: 'unknownStatus'
		});
		expect(giftFromMonica({ ...base, name: '  ' })).toEqual({ ok: false, reason: 'noTitle' });
	});
});

describe('parseMonicaGiftNote', () => {
	it('reads the first line, the comment and the link', () => {
		const body =
			'🎁 **Teapot** — offered, 12 October 2023\n\nCast iron\n\nhttps://shop.example/teapot';
		expect(parseMonicaGiftNote(body)).toEqual({
			name: 'Teapot',
			status: 'offered',
			day: '2023-10-12',
			comment: 'Cast iron',
			url: 'https://shop.example/teapot'
		});
	});

	it('reads a note with only a status, and one with only a title', () => {
		expect(parseMonicaGiftNote('🎁 **Teapot** — idea')).toEqual({
			name: 'Teapot',
			status: 'idea',
			day: null,
			comment: null,
			url: null
		});
		expect(parseMonicaGiftNote('🎁 **Teapot**')).toEqual({
			name: 'Teapot',
			status: null,
			day: null,
			comment: null,
			url: null
		});
	});

	it('reads a note with a day but no status', () => {
		const parsed = parseMonicaGiftNote('🎁 **Teapot** — 12. Oktober 2023');
		expect(parsed).toEqual({
			name: 'Teapot',
			status: null,
			day: '2023-10-12',
			comment: null,
			url: null
		});
	});

	it('keeps a comment of several paragraphs whole', () => {
		const body = '🎁 **Book** — idea\n\nThe second one.\n\nNot the first.';
		expect(parseMonicaGiftNote(body)?.comment).toBe('The second one.\n\nNot the first.');
		expect(parseMonicaGiftNote(body)?.url).toBeNull();
	});

	it('reads a last paragraph as the link only when it is one address', () => {
		const body = '🎁 **Book** — idea\n\nAsk at the shop\n\nshop.example/book';
		expect(parseMonicaGiftNote(body)?.url).toBe('shop.example/book');
		expect(parseMonicaGiftNote(body)?.comment).toBe('Ask at the shop');
		const lone = '🎁 **Book** — idea\n\nhttps://shop.example/book';
		expect(parseMonicaGiftNote(lone)?.url).toBe('https://shop.example/book');
		expect(parseMonicaGiftNote(lone)?.comment).toBeNull();
	});

	it('does not parse a note whose first line was rewritten', () => {
		expect(parseMonicaGiftNote('Teapot for Hilde, given at Christmas')).toBeNull();
		expect(parseMonicaGiftNote('🎁 Teapot — idea')).toBeNull();
		expect(parseMonicaGiftNote('🎁 **Teapot** — offered, sometime last year')).toBeNull();
	});
});

describe('giftFromMonicaNote', () => {
	const untouched = { createdAt: 1_000, updatedAt: 1_000 };

	it('converts a note as the import wrote it', () => {
		const result = giftFromMonicaNote({
			...untouched,
			body: '🎁 **Teapot** — received, 12 October 2023\n\nFrom Hilde'
		});
		expect(result).toEqual({
			ok: true,
			gift: {
				state: 'received',
				title: 'Teapot',
				givenOn: '2023-10-12',
				note: 'From Hilde',
				url: null
			}
		});
	});

	it('leaves a note edited since the import alone', () => {
		const result = giftFromMonicaNote({
			createdAt: 1_000,
			updatedAt: 2_000,
			body: '🎁 **Teapot** — idea'
		});
		expect(result).toEqual({ ok: false, reason: 'edited' });
	});

	it('leaves a note whose first line no longer parses alone', () => {
		const result = giftFromMonicaNote({ ...untouched, body: 'Teapot, cast iron' });
		expect(result).toEqual({ ok: false, reason: 'unparseable' });
	});

	it('leaves a parsed note it cannot turn into a gift alone, and says why', () => {
		const result = giftFromMonicaNote({ ...untouched, body: '🎁 **Teapot** — offered' });
		expect(result).toEqual({ ok: false, reason: 'noDay' });
	});
});

describe('giftsFromTouchpoint', () => {
	const touch = {
		contactId: 'hilde',
		participantIds: [] as string[],
		title: 'Teapot',
		description: 'Cast iron, for her birthday',
		happenedAt: '2024-05-02'
	};

	it('makes a given gift on its person, the title as the title and the description as the note', () => {
		expect(giftsFromTouchpoint(touch, 'Gift')).toEqual([
			{
				contactId: 'hilde',
				state: 'given',
				title: 'Teapot',
				note: 'Cast iron, for her birthday',
				givenOn: '2024-05-02'
			}
		]);
	});

	it('takes the description as the title when there is no title', () => {
		const [gift] = giftsFromTouchpoint({ ...touch, title: null }, 'Gift');
		expect(gift).toMatchObject({ title: 'Cast iron, for her birthday', note: null });
	});

	it('names a gift that says nothing with the fallback word', () => {
		const [gift] = giftsFromTouchpoint({ ...touch, title: '  ', description: null }, 'Gift');
		expect(gift).toMatchObject({ title: 'Gift', note: null });
	});

	it('makes one gift per participant, the person first', () => {
		const gifts = giftsFromTouchpoint(
			{ ...touch, participantIds: ['otto', 'hilde', 'otto'] },
			'Gift'
		);
		expect(gifts.map((g) => g.contactId)).toEqual(['hilde', 'otto']);
		expect(gifts.every((g) => g.title === 'Teapot' && g.givenOn === '2024-05-02')).toBe(true);
	});

	it('keeps only the day of a touchpoint that carries a time', () => {
		const [gift] = giftsFromTouchpoint({ ...touch, happenedAt: '2024-05-02T10:00:00Z' }, 'Gift');
		expect(gift.givenOn).toBe('2024-05-02');
	});
});
