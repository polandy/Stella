import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';

/*
 * Components colour themselves through semantic tokens only (docs/05 §5.2.2). Tailwind still
 * ships its own palette, and `bg-black/60` compiles as happily as `bg-scrim/60` — so this reads
 * the markup and fails on a palette utility, which would bypass the theme and the token table.
 */

const PALETTE =
	'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIXES =
	'bg|text|border|from|via|to|ring|fill|stroke|outline|divide|decoration|accent|caret|shadow';
const PALETTE_UTILITY = new RegExp(
	`\\b(?:${PREFIXES})-(?:black|white|(?:${PALETTE})-\\d{2,3})\\b`,
	'g'
);

describe('Tailwind palette utilities', () => {
	it('appear in no component or route — a semantic token says what the colour is for', () => {
		const found = [...new Glob('src/**/*.svelte').scanSync()].flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(PALETTE_UTILITY)].map((m) => `${file}: ${m[0]}`)
		);
		expect(found).toEqual([]);
	});

	it('are what the guard looks for', () => {
		const sample = 'bg-black/60 text-white from-black/65 border-gray-200 text-fg bg-scrim/60';
		expect(sample.match(PALETTE_UTILITY)).toEqual([
			'bg-black',
			'text-white',
			'from-black',
			'border-gray-200'
		]);
	});
});
