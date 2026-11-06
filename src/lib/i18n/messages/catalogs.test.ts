import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { de } from './de';
import { en } from './en';

/**
 * Every source and spec file outside the catalogues, as one text. A key is in use when it
 * stands there quoted, or when a template builds it from a prefix (`pwa.install.byHand.${…}`).
 */
function sourcesOutsideCatalogues(): string {
	return [...new Glob('{src,e2e}/**/*.{ts,svelte}').scanSync()]
		.filter((path) => !path.includes('i18n/messages/'))
		.map((path) => readFileSync(path, 'utf8'))
		.join('\n');
}

/*
 * The compiler already types each German area module against its English counterpart. This
 * guards the other half: that every area is actually merged into both barrels, so a new
 * module cannot reach production translated but unreachable (or English-only).
 */

describe('message catalogues', () => {
	it('speak the same keys in every language', () => {
		expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
	});

	it('leave a message empty only where English leaves it empty too', () => {
		// A few messages are the words *around* a link in a sentence, and a language may not
		// need one of them ("linked A → B" has no tail in English).
		const empty = Object.entries(de)
			.filter(([, value]) => value === '')
			.filter(([key]) => en[key as keyof typeof en] !== '');
		expect(empty).toEqual([]);
	});

	it('translate every message rather than copying the English one', () => {
		// Proper nouns and shared abbreviations are allowed to be identical; a wholesale copy
		// of an area would show up here as a run of untranslated sentences.
		const copied = Object.entries(en).filter(
			([key, value]) =>
				typeof value === 'string' &&
				value.split(' ').length > 3 &&
				de[key as keyof typeof de] === value
		);
		expect(copied).toEqual([]);
	});

	it('hold no message nothing says', () => {
		// Dead copy in two languages drifts unseen, and the parity check above keeps it alive.
		const text = sourcesOutsideCatalogues();
		const prefixes = [...text.matchAll(/[`'"]([a-zA-Z][\w.]*\.)\$\{/g)].map((m) => m[1]!);
		const unused = Object.keys(en).filter(
			(key) =>
				![`'${key}'`, `"${key}"`, `\`${key}\``].some((quoted) => text.includes(quoted)) &&
				!prefixes.some((prefix) => key.startsWith(prefix))
		);
		expect(unused).toEqual([]);
	});
});
