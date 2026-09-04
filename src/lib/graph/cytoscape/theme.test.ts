import { describe, expect, it, test } from 'bun:test';
import { mixHex, resolvePalette } from './theme';
import { buildStylesheet } from './stylesheet';

/*
 * Palette resolution + stylesheet building (docs/05 §5.6/§5.8), tested with a fake token
 * reader so no DOM or Cytoscape is needed. Proves categories map to their fixed accents and
 * that every colour is sourced from a token.
 */

const TOKENS: Record<string, string> = {
	'--fg': '#111',
	'--fg-muted': '#555',
	'--fg-subtle': '#888',
	'--bg': '#fff',
	'--bg-sunken': '#eee',
	'--card': '#f7f7f7',
	'--border': '#ddd',
	'--primary': '#8839ef',
	'--focus-ring': '#7287fd',
	'--ctp-mauve': '#8839ef',
	'--ctp-blue': '#1e66f5',
	'--ctp-green': '#40a02b',
	'--ctp-peach': '#fe640b',
	'--ctp-pink': '#ea76cb',
	'--ctp-teal': '#179299',
	'--ctp-sky': '#04a5e5',
	'--ctp-yellow': '#df8e1d',
	'--ctp-maroon': '#e64553',
	'--ctp-rosewater': '#dc8a78',
	'--ctp-sapphire': '#209fb5',
	'--ctp-lavender': '#7287fd'
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
