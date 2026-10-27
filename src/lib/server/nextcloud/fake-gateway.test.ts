import { describe, expect, it } from 'bun:test';
import { AddressBookUnreachableError } from '../domain/nextcloud/address-book';
import { createFakeAddressBook, FAKE_BOOK_PATH } from './fake-gateway';

const card = (uid: string, name = uid) =>
	`BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${uid}\r\nFN:${name}\r\nEND:VCARD\r\n`;

describe('the in-memory address book', () => {
	it('hands out the whole book first, then only what changed', async () => {
		const book = createFakeAddressBook({ 'a.vcf': card('a'), 'b.vcf': card('b') });
		const first = await book.changesSince(null);
		expect(first.complete).toBe(true);
		expect(first.changed.map((c) => c.href)).toEqual([
			`${FAKE_BOOK_PATH}a.vcf`,
			`${FAKE_BOOK_PATH}b.vcf`
		]);

		book.phone.save('a.vcf', card('a', 'Anna'));
		book.phone.delete('b.vcf');
		book.phone.save('c.vcf', card('c'));
		const next = await book.changesSince(first.token);
		expect(next.complete).toBe(false);
		expect(next.changed.map((c) => c.href)).toEqual([
			`${FAKE_BOOK_PATH}a.vcf`,
			`${FAKE_BOOK_PATH}c.vcf`
		]);
		expect(next.deleted).toEqual([`${FAKE_BOOK_PATH}b.vcf`]);

		const quiet = await book.changesSince(next.token);
		expect(quiet).toEqual({ token: next.token, changed: [], deleted: [], complete: false });
	});

	it('writes a card only at the etag it was read at', async () => {
		const book = createFakeAddressBook({ 'a.vcf': card('a') });
		const [read] = (await book.changesSince(null)).changed;

		const written = await book.put(read!.href, card('a', 'Anna'), read!.etag);
		expect(written).not.toBe('stale');
		expect(await book.put(read!.href, card('a', 'Old'), read!.etag)).toBe('stale');
		expect(await book.put(`${FAKE_BOOK_PATH}none.vcf`, card('x'), '"1"')).toBe('gone');
		expect(book.cards()[0]!.vcard).toContain('FN:Anna');
	});

	it('reads the whole book again once it forgot the token', async () => {
		const book = createFakeAddressBook({ 'a.vcf': card('a') });
		const first = await book.changesSince(null);
		book.forgetTokens();

		const again = await book.changesSince(first.token);
		expect(again.complete).toBe(true);
		expect(again.changed).toHaveLength(1);
		expect((await book.changesSince(again.token)).complete).toBe(false);
	});

	it('fails every call while unreachable', async () => {
		const book = createFakeAddressBook();
		book.setUnreachable(true);
		const error = await book.changesSince(null).catch((err: unknown) => err);
		expect(error).toBeInstanceOf(AddressBookUnreachableError);
	});
});
