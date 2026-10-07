import { describe, expect, it } from 'bun:test';
import type { Locale } from './locales';
import { de } from './messages/de';
import { en } from './messages/en';
import {
	createCatalogs,
	createTranslator,
	hasMessage,
	messageKey,
	loadCatalog,
	type Messages
} from './translate';

/*
 * The translator's own rules (docs/02 §2.19): a message missing from a translation falls
 * back to English rather than showing a raw key, and a key missing everywhere is a
 * programming error that must be loud rather than silent.
 */

describe('createTranslator', () => {
	it('says a message in the language asked for', () => {
		expect(createTranslator('de')('nav.people')).toBe('Menschen');
		expect(createTranslator('en')('nav.people')).toBe('People');
	});

	it('fills a message’s values', () => {
		expect(createTranslator('de')('contacts.count', { count: 2 })).toBe('2 Menschen');
	});

	it('falls back to English for a message a translation is missing', () => {
		// The compiler forbids a hole in the German catalogue, so one is punched at runtime:
		// this is the safety net for a message that goes missing some other way.
		const catalogue = de as unknown as Record<string, unknown>;
		const held = catalogue['nav.home'];
		delete catalogue['nav.home'];
		try {
			expect(createTranslator('de')('nav.home')).toBe('Home');
			// The positive control: the rest of the German catalogue is untouched.
			expect(createTranslator('de')('nav.people')).toBe('Menschen');
		} finally {
			catalogue['nav.home'] = held;
		}
	});

	it('falls back to English wholesale for a language it has no catalogue for', () => {
		expect(createTranslator('fr' as Locale)('nav.home')).toBe('Home');
	});

	it('throws on a key no catalogue knows, instead of rendering it', () => {
		const t = createTranslator('en') as (key: string) => string;
		expect(() => t('nav.nothing.like.this')).toThrow('Unknown message key: nav.nothing.like.this');
	});

	it('returns the same translator for a language, so lookups do not rebuild it', () => {
		expect(createTranslator('de')).toBe(createTranslator('de'));
	});
});

describe('hasMessage', () => {
	it('recognises a name built from a stored value', () => {
		expect(hasMessage('circles.kind.club')).toBe(true);
		expect(hasMessage('circles.kind.kegelclub-buehl')).toBe(false);
	});
});

/*
 * Only English ships with every page; another language is fetched on demand (docs/04 §4.4),
 * so the browser of someone who reads English never downloads German. The shelf is built
 * here over a hand-made German so each case controls exactly when the "download" lands.
 */
describe('createCatalogs — a language loaded on demand', () => {
	const german = { ...en, 'nav.people': 'Menschen' } as Messages;

	/** A loader whose download the test finishes by hand, counting how often it is asked. */
	function deferredGerman() {
		let finish: (messages: Messages) => void = () => {};
		let fail: (reason: Error) => void = () => {};
		const calls = { count: 0 };
		const loader = () => {
			calls.count += 1;
			return new Promise<Messages>((resolve, reject) => {
				finish = resolve;
				fail = reject;
			});
		};
		return { loader, calls, finish: (m: Messages) => finish(m), fail: (e: Error) => fail(e) };
	}

	it('refuses to translate a language before its catalogue has arrived', () => {
		const shelf = createCatalogs(en, { de: deferredGerman().loader });
		// Loud rather than English: silently answering in English is exactly the flash of the
		// wrong language — and the hydration mismatch — this ordering exists to rule out.
		expect(() => shelf.createTranslator('de')).toThrow(/not loaded/);
	});

	it('translates a language once its catalogue has been loaded', async () => {
		const download = deferredGerman();
		const shelf = createCatalogs(en, { de: download.loader });
		const loading = shelf.loadCatalog('de');
		download.finish(german);
		await loading;
		expect(shelf.createTranslator('de')('nav.people')).toBe('Menschen');
		// English needs no load at all: it is the fallback every page carries.
		expect(shelf.createTranslator('en')('nav.people')).toBe('People');
	});

	it('downloads a catalogue once, however many pages ask for it', async () => {
		const download = deferredGerman();
		const shelf = createCatalogs(en, { de: download.loader });
		const first = shelf.loadCatalog('de');
		const second = shelf.loadCatalog('de');
		download.finish(german);
		await Promise.all([first, second]);
		await shelf.loadCatalog('de');
		expect(download.calls.count).toBe(1);
	});

	it('lets a failed download be tried again rather than remembering the failure', async () => {
		const download = deferredGerman();
		const shelf = createCatalogs(en, { de: download.loader });
		const failing = shelf.loadCatalog('de');
		download.fail(new Error('offline'));
		await expect(failing).rejects.toThrow('offline');
		const retry = shelf.loadCatalog('de');
		download.finish(german);
		await retry;
		expect(download.calls.count).toBe(2);
		expect(shelf.createTranslator('de')('nav.people')).toBe('Menschen');
	});

	it('has the real German catalogue in reach of the app’s own shelf', async () => {
		await loadCatalog('de');
		expect(createTranslator('de')('nav.people')).toBe('Menschen');
	});
});

describe('messageKey', () => {
	it('hands back the key it was given, so a schema can carry it as its message', () => {
		expect(messageKey('auth.setup.needName')).toBe('auth.setup.needName');
	});
});
