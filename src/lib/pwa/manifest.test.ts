import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { APP_ICONS, APPLE_TOUCH_ICON, buildManifest } from './manifest';

describe('the web app manifest', () => {
	it('names and describes Stella in the reader’s language', () => {
		const english = buildManifest(createTranslator('en'));
		const german = buildManifest(createTranslator('de'));

		expect(english.description).toBe(createTranslator('en')('pwa.description'));
		expect(german.description).toBe(createTranslator('de')('pwa.description'));
		expect(german.description).not.toBe(english.description);
	});

	it('installs as the whole app rather than a bookmark to one page', () => {
		const manifest = buildManifest(createTranslator('en'));

		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
		// Scope has to cover every route, or a tap on a person leaves the installed window.
		expect(manifest.scope).toBe('/');
	});

	it('offers both an icon the launcher can crop and one it must not', () => {
		const purposes = APP_ICONS.map((icon) => icon.purpose);

		expect(purposes).toContain('any');
		expect(purposes).toContain('maskable');
	});

	it('offers the sizes Android asks for', () => {
		const anySizes = APP_ICONS.filter((icon) => icon.purpose === 'any').map((icon) => icon.sizes);

		expect(anySizes).toContain('192x192');
		expect(anySizes).toContain('512x512');
	});
});

describe('the icon iOS is given', () => {
	it('is a PNG, because Safari takes nothing else', () => {
		expect(APPLE_TOUCH_ICON.type).toBe('image/png');
	});

	it('is not the padded one, since Safari crops to its own shape regardless', () => {
		expect(APPLE_TOUCH_ICON.purpose).toBe('any');
	});
});
