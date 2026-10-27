import { describe, expect, it } from 'bun:test';
import { createDemoAddressBook, DEMO_DRIFT } from './demo-book';
import { FAKE_BOOK_PATH } from './fake-gateway';

/*
 * The demo book (docs/02 §2.16.3) stands for the household's phones too: once Stella has written
 * Markus's card, a phone changes it a single time, so the demo shows a card that fills a gap and
 * one that disagrees.
 */

const MARKUS = FAKE_BOOK_PATH + 'markus.vcf';

const markusOf = async (book: ReturnType<typeof createDemoAddressBook>, since: string) =>
	(await book.changesSince(since)).changed.find((c) => c.href === MARKUS);

describe('the demo address book', () => {
	it('leaves every card alone while Stella has not written Markus’s', async () => {
		const book = createDemoAddressBook();
		const first = await book.changesSince(null);
		expect(first.changed.map((c) => c.href)).toContain(MARKUS);

		expect((await book.changesSince(first.token)).changed).toEqual([]);
	});

	it('changes Markus’s card once, at the first sync after Stella wrote it, keeping what Stella wrote', async () => {
		const book = createDemoAddressBook();
		const first = await book.changesSince(null);
		const read = first.changed.find((c) => c.href === MARKUS)!;
		const written = read.vcard.replace('END:VCARD', 'NOTE:written by Stella\r\nEND:VCARD');
		expect(await book.put(MARKUS, written, read.etag)).not.toBeString();
		const drifted = await markusOf(book, first.token);
		expect(drifted?.vcard).toContain('NOTE:written by Stella');
		expect(drifted?.vcard).toContain(`BDAY:${DEMO_DRIFT.birthday}`);
		expect(drifted?.vcard).toContain(`EMAIL;TYPE=HOME:${DEMO_DRIFT.email}`);
		expect(drifted?.vcard.match(/^BDAY/gm)).toHaveLength(1);

		const now = await book.changesSince(null);
		expect((await book.changesSince(now.token)).changed).toEqual([]);
	});
});
