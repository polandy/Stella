import { describe, expect, it } from 'bun:test';
import { readNextcloudConfig, type RawNextcloudSettings } from './config';

const off: RawNextcloudSettings = {
	NEXTCLOUD_ADDRESS_BOOK_URL: '',
	NEXTCLOUD_USER: '',
	NEXTCLOUD_APP_PASSWORD: '',
	NEXTCLOUD_DEMO: false,
	SEED_DEMO: false
};

const book = 'https://cloud.example.com/remote.php/dav/addressbooks/users/family/contacts/';

describe('readNextcloudConfig', () => {
	it('is off when nothing is set', () => {
		expect(readNextcloudConfig(off)).toBeNull();
	});

	it('names the source after the address book, the trailing slash kept for WebDAV', () => {
		expect(
			readNextcloudConfig({
				...off,
				NEXTCLOUD_ADDRESS_BOOK_URL: book.slice(0, -1),
				NEXTCLOUD_USER: 'family',
				NEXTCLOUD_APP_PASSWORD: 'secret'
			})
		).toEqual({
			mode: 'http',
			url: book,
			user: 'family',
			appPassword: 'secret',
			source: 'nextcloud:contacts'
		});
	});

	it('refuses a half-made configuration without echoing the password', () => {
		const half = () =>
			readNextcloudConfig({
				...off,
				NEXTCLOUD_ADDRESS_BOOK_URL: book,
				NEXTCLOUD_APP_PASSWORD: 'x'
			});
		expect(half).toThrow('NEXTCLOUD_ADDRESS_BOOK_URL, NEXTCLOUD_USER and NEXTCLOUD_APP_PASSWORD');
	});

	it('refuses an address that is not http(s)', () => {
		expect(() =>
			readNextcloudConfig({
				...off,
				NEXTCLOUD_ADDRESS_BOOK_URL: 'ftp://cloud/book/',
				NEXTCLOUD_USER: 'a',
				NEXTCLOUD_APP_PASSWORD: 'b'
			})
		).toThrow('NEXTCLOUD_ADDRESS_BOOK_URL must be an http:// or https:// address');
	});

	it('wires the demo book only beside the demo household, and never with a real one', () => {
		expect(readNextcloudConfig({ ...off, NEXTCLOUD_DEMO: true, SEED_DEMO: true })).toEqual({
			mode: 'demo',
			source: 'nextcloud:contacts'
		});
		expect(() => readNextcloudConfig({ ...off, NEXTCLOUD_DEMO: true })).toThrow('SEED_DEMO=true');
		expect(() =>
			readNextcloudConfig({
				...off,
				NEXTCLOUD_DEMO: true,
				SEED_DEMO: true,
				NEXTCLOUD_ADDRESS_BOOK_URL: book
			})
		).toThrow('cannot be combined');
	});
});
