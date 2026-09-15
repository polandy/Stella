import { describe, expect, it } from 'bun:test';
import { APP_BACKGROUND } from './app-colors';

/*
 * `app.css` is the source of truth for the palette, but it cannot be imported from
 * TypeScript. Rather than trusting two copies to stay equal, read the stylesheet and
 * compare — a flavour swap that forgets the manifest fails here instead of shipping an
 * install splash in last season's colour.
 */

const stylesheet = await Bun.file(new URL('../../app.css', import.meta.url)).text();

/** Every value `--ctp-mantle` is given in the stylesheet, in source order. */
function mantleDeclarations(): string[] {
	return [...stylesheet.matchAll(/--ctp-mantle:\s*(#[0-9a-f]{6})\s*;/g)].map((match) => match[1]);
}

describe('the backgrounds the browser chrome is told about', () => {
	it('are the ones the stylesheet paints', () => {
		const declared = new Set(mantleDeclarations());

		expect(declared).toContain(APP_BACKGROUND.light);
		expect(declared).toContain(APP_BACKGROUND.dark);
	});

	it('cover every flavour the stylesheet defines', () => {
		// Mocha is declared twice — once under [data-theme='dark'], once in the media query —
		// so a third distinct value means a flavour arrived without a background to match.
		const declared = new Set(mantleDeclarations());

		expect(declared.size).toBe(Object.keys(APP_BACKGROUND).length);
	});
});
