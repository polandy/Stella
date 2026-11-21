import { describe, expect, it } from 'bun:test';
import cytoscape, { type Core } from 'cytoscape';

cytoscape.warnings(false);
import { resolveColor, tokensFor } from '../../design/css-tokens';
import { BRIDGE_CLASS, BRIDGE_OVER_CLASS, CAPTION_CLASS } from './canvas-classes';
import { buildStylesheet } from './stylesheet';
import { resolvePalette } from './theme';

/*
 * A parent line's stroke says its kind (docs/dev/05 §5.8): solid biological, double adoptive,
 * dash-dot foster, short-dash step — on the canvas and in the export, which share the sheet.
 */

const css = await Bun.file(new URL('../../../app.css', import.meta.url)).text();
const tokens = tokensFor(css, 'light');
const p = resolvePalette((name) => resolveColor(tokens, name) ?? tokens.get(name) ?? '');

/** A hex colour as Cytoscape reports it. */
const rgb = (hex: string) =>
	`rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')})`;

/** One computed style property, as the renderer reads it (`pstyle`, missing from the typings). */
interface Computed {
	value: unknown;
	strValue: string;
	pfValue: number;
}
type Styled = { pstyle(key: string): Computed };

/** Reads one element's computed style. */
const at = (cy: Core, id: string) => (key: string) => (cy.$id(id) as unknown as Styled).pstyle(key);

function core() {
	const line = (id: string, extra: Record<string, unknown> = {}) => ({
		data: { id, source: 'a', target: 'b', category: 'family', ...extra }
	});
	return cytoscape({
		headless: true,
		styleEnabled: true,
		style: buildStylesheet(p, { familyTree: true }),
		elements: [
			{ data: { id: 'a' } },
			{ data: { id: 'b' } },
			line('bio'),
			line('adoptive', { parentKind: 'adoptive' }),
			line('foster', { parentKind: 'foster' }),
			line('step', { parentKind: 'step' }),
			{ ...line('ended', { parentKind: 'foster' }), classes: 'former' },
			{ ...line('ended-adoptive', { parentKind: 'adoptive' }), classes: 'former' },
			{
				group: 'nodes' as const,
				data: { id: 'bridge:1:2' },
				classes: `${CAPTION_CLASS} ${BRIDGE_CLASS}`
			}
		]
	});
}

describe('a parent line’s stroke', () => {
	const cy = core();
	const of = (id: string) => at(cy, id);

	it('draws a biological parent’s line solid', () => {
		expect(of('bio')('line-style').strValue).toBe('solid');
		expect(Number(of('bio')('line-outline-width').value)).toBe(0);
	});

	it('draws an adoptive parent’s line double: a ground-coloured core between two rims', () => {
		expect(of('adoptive')('line-style').strValue).toBe('solid');
		expect(Number(of('adoptive')('line-outline-width').value)).toBeGreaterThan(0);
		expect(of('adoptive')('line-color').strValue).toBe(rgb(p.bg));
		expect(of('adoptive')('line-outline-color').strValue).toBe(of('bio')('line-color').strValue);
	});

	it('dashes a foster parent’s line dash-dot and a step-parent’s short', () => {
		expect(of('foster')('line-style').strValue).toBe('dashed');
		expect(of('foster')('line-dash-pattern').value).toEqual([9, 3, 2, 3]);
		expect(of('step')('line-style').strValue).toBe('dashed');
		expect(of('step')('line-dash-pattern').value).toEqual([4, 4]);
	});

	it('keeps an ended foster family’s dash-dot, thinner and muted like every former link', () => {
		expect(of('ended')('line-dash-pattern').value).toEqual([9, 3, 2, 3]);
		expect(of('ended')('width').pfValue).toBeLessThan(of('foster')('width').pfValue);
		expect(of('ended-adoptive')('line-outline-color').strValue).not.toBe(
			of('adoptive')('line-outline-color').strValue
		);
	});

	it('keeps an adoptive line double when it lies on a traced path', () => {
		cy.$id('adoptive').addClass('onpath');
		expect(Number(of('adoptive')('line-outline-width').value)).toBeGreaterThan(0);
		expect(of('adoptive')('line-color').strValue).toBe(rgb(p.bg));
		expect(of('adoptive')('line-outline-color').strValue).toBe(rgb(p.lines.path));
		cy.$id('adoptive').removeClass('onpath');
	});
});

describe('a bridge', () => {
	const cy = core();
	const of = (id: string) => at(cy, id);

	it('masks the bar in the ground colour above the lines, the crossing line over it', () => {
		const mask = of('bridge:1:2');
		expect(mask('z-index-compare').strValue).toBe('manual');
		expect(mask('events').strValue).toBe('no');
		expect(mask('background-color').strValue).toBe(rgb(p.bg));
		expect(mask('background-opacity').value).toBe(1);
		expect(mask('width').pfValue).toBeGreaterThan(1);
		cy.$id('bio').addClass(BRIDGE_OVER_CLASS);
		expect(Number(of('bio')('z-index').value)).toBeGreaterThan(Number(mask('z-index').value));
		expect(Number(mask('z-index').value)).toBeGreaterThan(Number(of('step')('z-index').value));
	});
});
