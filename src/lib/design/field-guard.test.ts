import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { FIELD, FIELD_FRAME, FIELD_ON_BG } from '../components/ui/field';

/*
 * Every text field shares one look and one focus ring (docs/05 §5.7, §5.9), set in
 * `ui/field.ts`. A form that rebuilds the frame by hand drifts — three focus looks grew that way —
 * so this reads the markup and fails on the field's edge spelled out anywhere else. A round
 * element may keep that edge: an empty colour swatch or a toggle pill is not a field.
 */

const CLASS_STRING = /(['"`])([^'"`]*\bborder-border-input\b[^'"`]*)\1/g;
const HAND_ROLLED_FOCUS = /\{FIELD(?:_ON_BG|_FRAME)?\}[^"'`]*?\b(?:focus|focus-within):/g;

function handRolledFields(source: string): string[] {
	return [...source.matchAll(CLASS_STRING)]
		.map((m) => m[2])
		.filter((classes) => !/\brounded-full\b/.test(classes));
}

// Markup, and the class constants beside it; the one module allowed the edge, and tests, aside.
const markup = () =>
	[...new Glob('src/**/*.{svelte,ts}').scanSync()]
		.filter((file) => !file.endsWith('ui/field.ts') && !file.endsWith('.test.ts'))
		.map((file) => ({
			file,
			source: readFileSync(file, 'utf8')
		}));

describe('text fields', () => {
	it('take their frame from ui/field.ts — no component or route spells it out', () => {
		const found = markup().flatMap(({ file, source }) =>
			handRolledFields(source).map((classes) => `${file}: ${classes}`)
		);
		expect(found).toEqual([]);
	});

	it('add no focus look of their own on top of the shared one', () => {
		const found = markup().flatMap(({ file, source }) =>
			[...source.matchAll(HAND_ROLLED_FOCUS)].map((m) => `${file}: ${m[0]}`)
		);
		expect(found).toEqual([]);
	});

	it('are what the guards look for', () => {
		const sample = `
			const INPUT = 'rounded-md border border-border-input bg-bg px-3 py-2 text-fg';
			<span class="size-2.5 shrink-0 rounded-full border border-border-input"></span>
			<input class="{FIELD} px-2 outline-none focus:ring-2 focus:ring-primary" />
			<input class="{FIELD} w-full px-3 py-2" />`;
		expect(handRolledFields(sample)).toEqual([
			'rounded-md border border-border-input bg-bg px-3 py-2 text-fg'
		]);
		expect(sample.match(HAND_ROLLED_FOCUS)).toEqual(['{FIELD} px-2 outline-none focus:']);
	});

	it('draw the focus ring through the field classes app.css styles', () => {
		const css = readFileSync('src/app.css', 'utf8');
		expect(FIELD.split(' ')).toContain('field');
		expect(FIELD_ON_BG.split(' ')).toContain('field');
		expect(FIELD_FRAME.split(' ')).toContain('field-frame');
		expect(css).toContain('.field:focus-visible');
		expect(css).toContain('.field-frame:has(input:focus-visible)');
	});
});
