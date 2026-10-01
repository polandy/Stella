import { describe, expect, it } from 'bun:test';
import { contrastRatio, AA_TEXT } from '../../design/color';
import { expandBadge } from './badge';

/*
 * The "+N" a node wears while expanding it would bring more people onto the map (docs/05
 * §5.8). The canvas cannot draw a DOM badge, so the badge is a small image; these hold what it
 * says and that it is drawn in the colours it is handed.
 */

const colours = { fill: '#eff1f5', text: '#4c4f69', ring: '#6c6f85' };

/** The SVG inside the data URI. */
const svgOf = (uri: string) => decodeURIComponent(uri.slice(uri.indexOf(',') + 1));

describe('expandBadge', () => {
	it('is an SVG image the canvas can load without a request', () => {
		expect(expandBadge(3, colours).uri.startsWith('data:image/svg+xml;')).toBe(true);
	});

	it('says how many more there are', () => {
		expect(svgOf(expandBadge(3, colours).uri)).toContain('>+3<');
		expect(svgOf(expandBadge(12, colours).uri)).toContain('>+12<');
	});

	it('caps the count it spells out, so the badge stays small', () => {
		expect(svgOf(expandBadge(250, colours).uri)).toContain('>99+<');
	});

	it('is drawn in the colours it is handed, never a colour of its own', () => {
		const svg = svgOf(expandBadge(3, colours).uri);
		const used = svg.match(/#[0-9a-f]{3,8}/gi) ?? [];
		expect(new Set(used.map((c) => c.toLowerCase()))).toEqual(
			new Set([colours.fill, colours.text, colours.ring])
		);
		// The words are the badge's whole message, so they are written in a text colour.
		expect(contrastRatio(colours.text, colours.fill)).toBeGreaterThanOrEqual(AA_TEXT);
	});

	it('grows wider for a longer count, and says how big it is', () => {
		const one = expandBadge(3, colours);
		const two = expandBadge(12, colours);
		expect(two.width).toBeGreaterThan(one.width);
		expect(one.height).toBe(two.height);
		expect(svgOf(one.uri)).toContain(`width="${one.width}"`);
	});
});
