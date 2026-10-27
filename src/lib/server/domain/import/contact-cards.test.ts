import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readContactCards } from './contact-cards';

/*
 * The cards the matching review compares (docs/concepts/contact-sources.md §1.1–1.4), read
 * from real-shaped exports: Google's two and Nextcloud's, each with its own quirks.
 */

const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

const card = (...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

describe('readContactCards', () => {
	it('reads a Google export for iOS, labels and all', () => {
		const { source, cards, linkPhotos } = readContactCards(fixture('google-contacts-ios.vcf'));

		expect(source).toBe('vcard:google');
		expect(linkPhotos).toBe(1);
		expect(cards[0]).toMatchObject({
			firstName: 'Anna',
			lastName: 'Example',
			displayName: 'Anna Example',
			nickname: 'Anni',
			company: 'Example AG',
			jobTitle: 'Engineer',
			birthday: { value: '--04-07', precision: 'month_day' },
			emails: [
				{ value: 'anna.example@example.org', label: { known: 'home' } },
				{ value: 'Anna.Example@Work.Example.COM', label: { known: 'work' } },
				{ value: 'anni@example.net', label: { typed: 'Old school' } }
			],
			phones: [
				{ value: '+41 79 000 00 01', label: { known: 'mobile' } },
				{ value: '031 000 00 02', label: { known: 'home' } },
				{ value: '079 000 00 03', label: { typed: 'Signal' } }
			],
			// An empty custom label says nothing.
			addresses: [
				{ value: 'Examplestrasse 1, 3007 Bern, Switzerland', label: { known: 'home' } },
				{ value: 'Musterweg 9, 3600 Thun, CH', label: null }
			],
			// Google's own groups are no tags.
			tags: ['Family', 'Kindergarten 2023'],
			photo: 'link'
		});
		expect(cards[1]).toMatchObject({
			displayName: 'Bruno Beispiel',
			birthday: { value: '1980-02-29', precision: 'full' },
			tags: [],
			photo: null
		});
	});

	it('keys a Google card by the contact id in its photo, else by name and first number', () => {
		const { cards } = readContactCards(fixture('google-contacts-ios.vcf'));

		expect(cards.map((c) => c.key)).toEqual([
			'photo:AOq4LdaEXAMPLE0000000000000000000000000000000000000000',
			'name:beispiel bruno|+41790000004'
		]);
	});

	it('reads a Google Takeout file the same way', () => {
		const { source, cards } = readContactCards(fixture('google-takeout.vcf'));

		expect(source).toBe('vcard:google');
		expect(cards[0]).toMatchObject({
			birthday: { value: '--04-07', precision: 'month_day' },
			tags: ['Family']
		});
	});

	it('reads a Nextcloud download, keyed by UID, with its pictures inline', () => {
		const { source, cards, linkPhotos } = readContactCards(fixture('nextcloud-contacts.vcf'));

		expect(source).toBe('vcard:nextcloud');
		expect(linkPhotos).toBe(0);
		expect(cards.map((c) => [c.key, c.photo])).toEqual([
			['7f3c1a52-0000-4000-8000-000000000001', 'inline'],
			['7f3c1a52-0000-4000-8000-000000000002', 'inline']
		]);
		expect(cards[0]!.phones).toEqual([
			{ value: '+41790000001', label: { known: 'mobile' } },
			// VOICE says nothing; HOME beside it does.
			{ value: '+41 31 000 00 02', label: { known: 'home' } }
		]);
		expect(cards[0]!.tags).toEqual(['Family', 'Kindergarten 2023']);
	});

	it('is another source when the file says nothing about where it came from', () => {
		const { source, cards } = readContactCards(
			card('UID:u1', 'FN:Anna Example', 'N:Example;Anna;;;', 'CATEGORIES:starred')
		);

		expect(source).toBe('vcard:other');
		// Only Google's `starred` is Google's own; anywhere else it is the member's tag.
		expect(cards[0]!.tags).toEqual(['starred']);
	});

	it('keeps the hash when only the revision stamp moves, and changes it with a fact', () => {
		const base = ['UID:u1', 'FN:Anna Example', 'N:Example;Anna;;;', 'TEL:+41 79 000 00 01'];
		const hash = (...lines: string[]) => readContactCards(card(...lines)).cards[0]!.hash;

		expect(hash(...base, 'REV:2026-10-20T08:00:00Z')).toBe(
			hash(...base, 'REV:2026-10-21T08:00:00Z')
		);
		expect(hash(...base)).not.toBe(hash(...base, 'EMAIL:anna@example.org'));
	});

	it('keeps two cards apart that would get the same key', () => {
		const twin = card('FN:Anna Example', 'N:Example;Anna;;;', 'EMAIL:anna@example.org');
		const { cards } = readContactCards([twin, twin].join('\r\n'));

		expect(cards.map((c) => c.key)).toEqual([
			'name:anna example|anna@example.org',
			'name:anna example|anna@example.org~2'
		]);
	});
});
