import { describe, expect, it, test } from 'bun:test';
import { resolvePalette } from './theme';
import { AA_LARGE, contrastRatio, mixHex } from '../../design/color';
import { resolveColor, tokensFor, type Theme } from '../../design/css-tokens';
import { RELATIONSHIP_CATEGORIES } from '../../design/tokens';
import { buildStylesheet } from './stylesheet';

/*
 * Palette resolution + stylesheet building (docs/05 §5.6/§5.8), tested with a fake token
 * reader so no DOM or Cytoscape is needed. Proves categories map to their fixed accents and
 * that every colour is sourced from a token.
 */

const TOKENS: Record<string, string> = {
	'--font-sans': 'Test Sans, sans-serif',
	'--fg': '#111',
	'--fg-muted': '#555',
	'--fg-subtle': '#888',
	'--bg': '#fff',
	'--bg-sunken': '#eee',
	'--card': '#f7f7f7',
	'--border': '#ddd',
	'--primary': '#8839ef',
	'--focus-ring': '#7287fd',
	'--accent-mauve': '#8839ef',
	'--accent-blue': '#1e66f5',
	'--accent-green': '#40a02b',
	'--accent-peach': '#fe640b',
	'--accent-pink': '#ea76cb',
	'--accent-teal': '#179299',
	'--accent-sky': '#04a5e5',
	'--accent-yellow': '#df8e1d',
	'--accent-maroon': '#e64553',
	'--accent-rosewater': '#dc8a78',
	'--accent-sapphire': '#209fb5',
	'--accent-lavender': '#7287fd',
	'--accent-flamingo': '#dd7878',
	'--accent-red': '#d20f39',
	'--cat-family': '#40a02b',
	'--cat-romantic': '#ea76cb',
	'--cat-social': '#1e66f5',
	'--cat-professional': '#fe640b',
	'--cat-other': '#888',
	'--edge-membership': '#7287fd',
	'--edge-kinship': '#888'
};
const read = (v: string) => TOKENS[v] ?? '';

describe('resolvePalette', () => {
	const p = resolvePalette(read);

	it('maps relationship categories to their fixed accents', () => {
		expect(p.categories.family).toBe('#40a02b'); // green
		expect(p.categories.romantic).toBe('#ea76cb'); // pink
		expect(p.categories.social).toBe('#1e66f5'); // blue
		expect(p.categories.professional).toBe('#fe640b'); // peach
	});

	it('uses lavender for circle membership and the subtle fg for kinship', () => {
		expect(p.membership).toBe('#7287fd');
		expect(p.kinship).toBe('#888');
	});

	it('carries the interface font, so canvas labels match the page', () => {
		expect(p.fontSans).toBe('Test Sans, sans-serif');
	});

	it('keeps a line colour that already reads on the canvas exactly as its token', () => {
		expect(p.lines.categories.social).toBe('#1e66f5');
	});

	it('deepens a line colour that would vanish on the canvas, keeping its hue', () => {
		expect(p.lines.categories.romantic).not.toBe('#ea76cb');
		expect(contrastRatio(p.lines.categories.romantic, '#fff')).toBeGreaterThanOrEqual(AA_LARGE);
	});
});

/*
 * The real stylesheet against the real tokens (docs/05 §5.9): on the canvas an edge is the
 * only carrier of its category once the legend is off screen, so every line the explorer
 * draws has to clear the 3:1 non-text bar on the page ground in both themes.
 */
const css = await Bun.file(new URL('../../../app.css', import.meta.url)).text();

describe('every explorer line clears 3:1 on the canvas', () => {
	for (const theme of ['light', 'dark', 'system-dark'] as Theme[]) {
		const tokens = tokensFor(css, theme);
		const p = resolvePalette((name) => resolveColor(tokens, name) ?? tokens.get(name) ?? '');

		it(`in ${theme}`, () => {
			const lines = [
				...RELATIONSHIP_CATEGORIES.map((c) => [c, p.lines.categories[c]] as const),
				['membership', p.lines.membership] as const,
				['kinship', p.lines.kinship] as const
			];
			const failing = lines.filter(([, hex]) => contrastRatio(hex, p.bg) < AA_LARGE);
			expect(failing).toEqual([]);
		});
	}
});

describe('buildStylesheet', () => {
	const styles = buildStylesheet(resolvePalette(read));
	const has = (selector: string) => styles.some((s) => s.selector === selector);

	it('produces selectors for each edge kind and category', () => {
		expect(has('edge[category = "family"]')).toBe(true);
		expect(has('edge[kind = "membership"]')).toBe(true);
		expect(has('edge[kind = "kinship"]')).toBe(true);
		expect(has('node.circle')).toBe(true);
		expect(has('node.center')).toBe(true);
	});

	it('gives every person accent its own background selector', () => {
		expect(has('node.person[accent = "mauve"]')).toBe(true);
		expect(has('node.person[accent = "green"]')).toBe(true);
	});

	it('draws a photo on a person who has one, clipped to the disc', () => {
		const photo = styles.find((s) => s.selector === 'node.person.has-photo');
		expect(photo?.style).toMatchObject({ 'background-image': 'data(photo)', 'background-fit': 'cover' });
	});

	it('draws edges in their canvas-safe depth, not the raw token', () => {
		const romantic = styles.find((s) => s.selector === 'edge[category = "romantic"]');
		expect(romantic?.style['line-color']).toBe(resolvePalette(read).lines.categories.romantic);
	});
});

describe('mixHex', () => {
	test('blends two hex colours by percentage', () => {
		expect(mixHex('#000000', 50, '#ffffff')).toBe('#808080');
	});

	test('0% is the base colour and 100% is the accent', () => {
		expect(mixHex('#40a02b', 0, '#e6e9ef')).toBe('#e6e9ef');
		expect(mixHex('#40a02b', 100, '#e6e9ef')).toBe('#40a02b');
	});

	test('expands three-digit hex', () => {
		expect(mixHex('#f00', 100, '#fff')).toBe('#ff0000');
	});

	test('falls back to the accent when a colour is not hex', () => {
		// Cytoscape parses the result itself, so an unmixed accent still renders.
		expect(mixHex('rgb(1 2 3)', 45, '#ffffff')).toBe('rgb(1 2 3)');
	});
});
