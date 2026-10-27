import { describe, expect, it } from 'bun:test';
import { anna, b64, cardOf, JPEG, linkedAnna, setup, vcf } from '../testing/nextcloud-book';
import { BOOK, SYSTEM } from '../testing/nextcloud-household';

/*
 * The sync both ways (docs/02 §2.16.3), driven through a book in memory whose `phone` edits it
 * from aside, as the household's phones would.
 */

describe('a first sync', () => {
	it('holds every card and leaves the new ones to the review', async () => {
		const { house, sync } = setup({ 'anna.vcf': anna(), 'bert.vcf': vcf('bert', 'FN:Bert') });
		const outcome = await sync();

		expect(outcome).toEqual({ newCards: 2, updated: 0, written: 0, conflicts: 0, unlinked: 0 });
		expect([...house.mirror.values()].map((c) => c.uid).sort()).toEqual(['anna', 'bert']);
	});

	it('writes nothing for a fresh link whose card already says what Stella holds', async () => {
		const { book, sync } = await linkedAnna();
		const before = book.cards();
		expect(await sync()).toMatchObject({ newCards: 0, written: 0 });
		expect(book.cards()).toEqual(before);
	});
});

describe('a card changed on a phone', () => {
	it('adds what the person is missing, and is not written back', async () => {
		const { house, book, sync } = await linkedAnna();
		book.phone.save('anna.vcf', anna('EMAIL;TYPE=WORK:anna@example.com'));

		expect(await sync()).toMatchObject({ updated: 1, written: 0, conflicts: 0 });
		expect(house.people.get('p-anna')!.fields).toContainEqual({
			kind: 'email',
			value: 'anna@example.com',
			label: 'Work'
		});
		expect(house.audits.map((a) => a.event)).toContainEqual(
			expect.objectContaining({ kind: 'contacts.reviewed', completed: 1, source: BOOK })
		);
		expect(house.audits.at(-1)!.actorId).toBe(SYSTEM.id);
		// The next sync finds nothing to do either way.
		expect(await sync()).toMatchObject({ updated: 0, written: 0 });
	});

	it('asks about a name it says otherwise, and keeps Stella’s until answered', async () => {
		const { house, book, sync } = await linkedAnna();
		book.phone.save('anna.vcf', anna().replace('N:Muster;Anna', 'N:Meier;Anna'));
		house.people.get('p-anna')!.fields.push({ kind: 'email', value: 'a@b.ch', label: null });

		expect(await sync()).toMatchObject({ conflicts: 1, written: 0 });
		expect(house.conflicts.map((c) => c.conflict)).toEqual([
			{ kind: 'lastName', stella: 'Muster', card: 'Meier' }
		]);
		expect(house.people.get('p-anna')!.lastName).toBe('Muster');
		// Stella's own change waits too, while the conflict does.
		expect(cardOf(book, 'anna')).not.toContain('a@b.ch');
	});

	it('does not bring back what Stella removed while the card kept it', async () => {
		const { house, book, sync } = await linkedAnna({
			fields: [
				{ kind: 'phone', value: '+41 79 111 22 33', label: 'Mobile' },
				{ kind: 'email', value: 'old@example.com', label: null }
			]
		});
		book.phone.save('anna.vcf', anna('EMAIL:old@example.com'));
		await sync();
		house.people.get('p-anna')!.fields.splice(1, 1);
		book.phone.save('anna.vcf', anna('EMAIL:old@example.com', 'NOTE:hi'));

		await sync();
		expect(house.people.get('p-anna')!.fields.map((f) => f.value)).toEqual(['+41 79 111 22 33']);
		expect(cardOf(book, 'anna')).not.toContain('old@example.com');
		expect(cardOf(book, 'anna')).toContain('NOTE:hi');
	});

	it('leaves a card it cannot read alone', async () => {
		const { book, sync } = setup();
		await sync();
		book.phone.save('broken.vcf', 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Half');
		expect(await sync()).toMatchObject({ newCards: 1 });
	});
});

describe('a change in Stella', () => {
	it('is written onto the card, keeping what Stella does not hold', async () => {
		const { house, book, sync } = await linkedAnna();
		book.phone.save('anna.vcf', anna('NOTE:Likes tea'));
		await sync();
		const anna_ = house.people.get('p-anna')!;
		anna_.fields.push({ kind: 'email', value: 'neu@example.com', label: 'Chor' });
		anna_.homeLines.push('Dorfstrasse 1, 8000 Zürich');

		expect(await sync()).toMatchObject({ written: 1 });
		const card = cardOf(book, 'anna');
		expect(card).toContain('NOTE:Likes tea');
		expect(card).toContain('.EMAIL:neu@example.com');
		expect(card).toContain('ADR;TYPE=HOME:;;Dorfstrasse 1\\, 8000 Zürich;;;;');
		// Stella's own write does not come back in as a change.
		expect(await sync()).toMatchObject({ updated: 0, written: 0 });
	});

	it('waits for a card a phone changed meanwhile, and brings that in first', async () => {
		const { house, book, sync } = await linkedAnna();
		house.people.get('p-anna')!.firstName = 'Anna-Lena';
		const put = book.put.bind(book);
		book.put = async (href, vcard, etag) => {
			book.phone.save('anna.vcf', anna('EMAIL:x@example.com'));
			return put(href, vcard, etag);
		};
		expect(await sync()).toMatchObject({ written: 0 });

		book.put = put;
		await sync();
		expect(house.people.get('p-anna')!.fields.map((f) => f.value)).toContain('x@example.com');
		expect(cardOf(book, 'anna')).toContain('N:Muster;Anna-Lena');
	});
});

describe('pictures', () => {
	it('a card’s fills a person who has none', async () => {
		const { house, book, sync } = await linkedAnna();
		book.phone.save('anna.vcf', anna(`PHOTO;ENCODING=b;TYPE=JPEG:${b64(JPEG)}`));

		await sync();
		const avatar = house.people.get('p-anna')!.avatar!;
		expect(house.files.get(avatar.path)).toEqual(JPEG);
		expect(await sync()).toMatchObject({ written: 0 });
	});

	it('a different one on the card is asked about', async () => {
		const { house, book, sync } = await linkedAnna({
			hasPhoto: true,
			avatar: { photoId: 'mine', path: 'mine.jpg', mime: 'image/jpeg' }
		});
		house.files.set('mine.jpg', new Uint8Array([...JPEG, 1]));
		await sync();
		book.phone.save('anna.vcf', anna(`PHOTO;ENCODING=b;TYPE=JPEG:${b64(JPEG)}`));

		expect(await sync()).toMatchObject({ conflicts: 1 });
		expect(house.conflicts.map((c) => c.conflict)).toEqual([{ kind: 'photo' }]);
	});

	it('one Stella could not store is not asked about', async () => {
		const { house, book, sync } = await linkedAnna({
			hasPhoto: true,
			avatar: { photoId: 'mine', path: 'mine.jpg', mime: 'image/jpeg' }
		});
		house.files.set('mine.jpg', JPEG);
		await sync();
		// A GIF: Stella keeps only JPEG and PNG pictures it can size without a browser.
		book.phone.save('anna.vcf', anna('PHOTO;ENCODING=b;TYPE=GIF:R0lGODlhAQABAAAAACw='));

		expect(await sync()).toMatchObject({ conflicts: 0 });
		expect(house.conflicts).toEqual([]);
	});

	it('Stella’s goes onto a card that has none', async () => {
		const { house, book, sync } = await linkedAnna();
		house.files.set('mine.jpg', JPEG);
		Object.assign(house.people.get('p-anna')!, {
			hasPhoto: true,
			avatar: { photoId: 'mine', path: 'mine.jpg', mime: 'image/jpeg' }
		});

		expect(await sync()).toMatchObject({ written: 1 });
		expect(cardOf(book, 'anna')).toContain(`PHOTO;ENCODING=b;TYPE=JPEG:${b64(JPEG)}`);
	});
});

describe('unlinking', () => {
	it('a card deleted in Nextcloud only unlinks its person', async () => {
		const { house, book, sync } = await linkedAnna();
		book.phone.delete('anna.vcf');

		expect(await sync()).toMatchObject({ unlinked: 1 });
		expect(house.links.has('anna')).toBe(false);
		expect(house.mirror.size).toBe(0);
		expect(house.people.has('p-anna')).toBe(true);
	});

	it('a card missing from a whole read after the server forgot the token unlinks too', async () => {
		const { book, sync } = await linkedAnna();
		book.forgetTokens();
		book.phone.delete('anna.vcf');
		expect(await sync()).toMatchObject({ unlinked: 1 });
	});

	it('a private person is never written to, and their link is dropped', async () => {
		const { house, book, sync } = await linkedAnna();
		const p = house.people.get('p-anna')!;
		p.visibility = 'private';
		p.lastName = 'Geheim';

		expect(await sync()).toMatchObject({ unlinked: 1, written: 0 });
		expect(cardOf(book, 'anna')).not.toContain('Geheim');
		expect(house.links.has('anna')).toBe(false);
	});
});

describe('a book out of reach', () => {
	it('fails the sync and keeps where the last one stopped', async () => {
		const { book, sync, house } = await linkedAnna();
		const held = structuredClone([...house.mirror.values()]);
		book.setUnreachable(true);
		await expect(sync()).rejects.toThrow('unreachable');
		expect([...house.mirror.values()]).toEqual(held);
	});
});
