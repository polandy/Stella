import { describe, expect, it, test } from 'bun:test';
import { resolvePalette } from './theme';
import { AA_LARGE, AA_TEXT, contrastRatio, mixHex } from '../../design/color';
import { resolveColor, tokensFor, type Theme } from '../../design/css-tokens';
import { RELATIONSHIP_CATEGORIES } from '../../relationships/categories';
import {
	buildStylesheet,
	CAPTION_CLASS,
	CURSOR_CLASS,
	HAS_MORE_CLASS,
	HOVERED_CLASS,
	ROUTE_FIELDS,
	ROUTED_CLASS,
	type CyStyle
} from './stylesheet';
import { LABEL_MIN_ZOOMED_FONT_SIZE } from '../layout/legibility';

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
	'--edge-kinship': '#888',
	'--tint-avatar': '28%'
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

	it("takes the theme's avatar tint, so a disc on the map matches the avatar in the list", () => {
		expect(p.avatarTint).toBe(28);
	});

	it('refuses a tint it cannot read, rather than drawing an untinted disc', () => {
		expect(() => resolvePalette((v) => (v === '--tint-avatar' ? '' : read(v)))).toThrow(
			'--tint-avatar'
		);
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
				['kinship', p.lines.kinship] as const,
				['path', p.lines.path] as const
			];
			const failing = lines.filter(([, hex]) => contrastRatio(hex, p.bg) < AA_LARGE);
			expect(failing).toEqual([]);
		});

		/*
		 * A line drawn see-through is a different colour from its token: 0.6 opacity took every
		 * line in Latte back under 3:1 after `ensureContrast` had lifted it over. So the colour
		 * that counts is the one on screen — the line blended over the ground by its rule's
		 * opacity — and only fading, which de-emphasises on purpose, may go below.
		 */
		it(`keeps every line clear of 3:1 as drawn, opacity included, in ${theme}`, () => {
			const sheet = buildStylesheet(p);
			const rule = (selector: string) => sheet.find((s) => s.selector === selector)?.style ?? {};
			const opacityOf = (selector: string) => Number(rule(selector).opacity ?? 1);
			const drawn = (hex: string, opacity: number) => mixHex(hex, opacity * 100, p.bg);
			const base = Math.min(opacityOf('edge'), 1);
			const cases = [
				...RELATIONSHIP_CATEGORIES.map((c) => [c, p.lines.categories[c], base] as const),
				['membership', p.lines.membership, base] as const,
				['kinship', p.lines.kinship, Math.min(base, opacityOf('edge[kind = "kinship"]'))] as const,
				['bundle', p.lines.categories.family, Math.min(base, opacityOf('edge.bundle'))] as const,
				['unknown category', String(rule('edge')['line-color']), base] as const
			];
			const failing = cases
				.filter(([, hex, opacity]) => contrastRatio(drawn(hex, opacity), p.bg) < AA_LARGE)
				.map(([name]) => name);
			expect(failing).toEqual([]);
		});

		/*
		 * The family tree draws its lines at right angles, but in the same colours: a routed line
		 * may change its shape, never its colour or its opacity, so the 3:1 above still holds.
		 */
		it(`keeps the family tree's lines and caption as readable as the rest, in ${theme}`, () => {
			const sheet = buildStylesheet(p, { familyTree: true });
			const routed = sheet.filter((s) => s.selector.includes(`edge.${ROUTED_CLASS}`));
			const colours = ['line-color', 'target-arrow-color', 'opacity', 'line-style', 'width'];

			expect(routed.length).toBeGreaterThan(0);
			for (const rule of routed) {
				expect(Object.keys(rule.style).filter((key) => colours.includes(key))).toEqual([]);
			}
			const caption = sheet.find((s) => s.selector === `node.${CAPTION_CLASS}`)!.style;
			expect(contrastRatio(String(caption.color), p.bg)).toBeGreaterThanOrEqual(AA_TEXT);
		});
	}
});

describe('buildStylesheet as the family tree', () => {
	const palette = resolvePalette(read);
	const tree = buildStylesheet(palette, { familyTree: true });
	const free = buildStylesheet(palette);
	const rulesFor = (sheet: CyStyle[], selector: string) =>
		sheet.filter((s) => s.selector === selector).map((s) => s.style);
	const element = (data: Record<string, unknown>) => ({ data: (key: string) => data[key] });

	it('writes each person’s role under their name, and the name alone without one', () => {
		const label = rulesFor(tree, 'node.person')[0].label as (ele: unknown) => string;

		expect(label(element({ label: 'Otto Brunner', role: 'Grandfather' }))).toBe(
			'Otto Brunner\nGrandfather'
		);
		expect(label(element({ label: 'Eva Roth', role: '' }))).toBe('Eva Roth');
		// Two lines need wrapping rather than cutting short; the 8 px floor stays.
		expect(rulesFor(tree, 'node.person')[0]).toMatchObject({
			'text-wrap': 'wrap',
			'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE
		});
	});

	it('writes names alone in every other arrangement', () => {
		expect(rulesFor(free, 'node.person')[0]).toMatchObject({
			label: 'data(label)',
			'text-wrap': 'ellipsis'
		});
	});

	it('lights the centre softly, around its ring', () => {
		const centre = Object.assign({}, ...rulesFor(tree, 'node.center'));

		expect(centre).toMatchObject({
			'border-color': palette.primary,
			'underlay-color': palette.primary
		});
		expect(centre['underlay-opacity']).toBeGreaterThan(0);
		expect(centre['underlay-opacity']).toBeLessThan(0.3);
		expect(Object.assign({}, ...rulesFor(free, 'node.center'))['underlay-color']).toBeUndefined();
	});

	it('draws a routed line through the bends the controller set, from the node centres', () => {
		const routed = Object.assign({}, ...rulesFor(free, `edge.${ROUTED_CLASS}`));
		const edge = element({
			[ROUTE_FIELDS.weights]: [0.2, 0.8],
			[ROUTE_FIELDS.distances]: [10, -10],
			[ROUTE_FIELDS.sourceEndpoint]: '-50px 0px',
			[ROUTE_FIELDS.targetEndpoint]: 'outside-to-node'
		});

		expect(routed).toMatchObject({
			'curve-style': 'segments',
			'edge-distances': 'node-position',
			'target-arrow-shape': 'none'
		});
		expect(routed['segment-weights'](edge)).toEqual([0.2, 0.8]);
		expect(routed['segment-distances'](edge)).toEqual([10, -10]);
		expect(routed['source-endpoint'](edge)).toBe('-50px 0px');
		expect(routed['target-endpoint'](edge)).toBe('outside-to-node');
	});

	it('names no line around a person, not even selected or pointed at — the roles say it', () => {
		const lastWord = (sheet: CyStyle[]) => {
			const named = sheet.findLastIndex((s) => s.selector.includes('edge.highlight'));
			const silenced = sheet.findLastIndex(
				(s) => s.selector === 'edge' && s.style['text-opacity'] === 0
			);
			return silenced > named;
		};

		expect(lastWord(tree)).toBe(true);
		// Without a centre to say roles towards, a line keeps its name as before.
		expect(lastWord(free)).toBe(false);
	});

	it('writes a caption that taps fall through', () => {
		expect(rulesFor(tree, `node.${CAPTION_CLASS}`)[0]).toMatchObject({
			label: 'data(label)',
			events: 'no',
			'background-opacity': 0,
			'border-width': 0
		});
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

	it('keeps edge labels hidden until the edge is highlighted, hovered or on a path', () => {
		const edge = styles.find((s) => s.selector === 'edge');
		expect(edge?.style).toMatchObject({ label: 'data(label)', 'text-opacity': 0 });

		const named = styles.find(
			(s) => s.selector === `edge.highlight, edge.onpath, edge.${HOVERED_CLASS}`
		);
		expect(named?.style).toEqual({ 'text-opacity': 1 });
	});

	it('draws each arrowhead in the colour of its own line', () => {
		const lineRules = styles.filter(
			(s) => s.selector.startsWith('edge') && s.style['line-color'] !== undefined
		);
		expect(lineRules.length).toBeGreaterThan(5);
		for (const rule of lineRules) {
			expect({ selector: rule.selector, arrow: rule.style['target-arrow-color'] }).toEqual({
				selector: rule.selector,
				arrow: rule.style['line-color']
			});
		}
		// The direction rule only switches the arrow on; it must not repaint it.
		const directed = styles.find((s) => s.selector === 'edge[directed = 1]');
		expect(directed?.style['target-arrow-color']).toBeUndefined();
	});

	it('traces a path in its canvas-safe colour, the arrowheads with it', () => {
		const p = resolvePalette(read);
		expect(styles.find((s) => s.selector === 'edge.onpath')?.style).toMatchObject({
			'line-color': p.lines.path,
			'target-arrow-color': p.lines.path
		});
	});

	it('drops the names of people and circles that zoom out too small to read', () => {
		for (const selector of ['node.person', 'node.circle', 'node.role-group']) {
			const rule = styles.find((s) => s.selector === selector);
			expect({ selector, size: rule?.style['min-zoomed-font-size'] }).toEqual({
				selector,
				size: LABEL_MIN_ZOOMED_FONT_SIZE
			});
		}
		expect(LABEL_MIN_ZOOMED_FONT_SIZE).toBe(8);
	});

	it('sizes a person by the diameter the elements carry', () => {
		const person = styles.find((s) => s.selector === 'node.person');
		expect(person?.style).toMatchObject({ width: 'data(size)', height: 'data(size)' });
	});

	it('marks the selection and the keyboard cursor differently, not by colour alone', () => {
		const selected = styles.find((s) => s.selector === 'node.selected')?.style ?? {};
		const cursor = styles.find((s) => s.selector === `node.${CURSOR_CLASS}`)?.style ?? {};
		// The selection is a filled halo around a solid border; the cursor a dashed ring.
		expect(Number(selected['underlay-opacity'])).toBeGreaterThan(0);
		expect(Number(selected['underlay-padding'])).toBeGreaterThan(0);
		expect(cursor['outline-style']).toBe('dashed');
		expect(cursor['underlay-opacity']).toBeUndefined();
		expect(selected['outline-style']).toBeUndefined();
	});

	it('marks a deceased person with a muted double ring, never by fading them', () => {
		const p = resolvePalette(read);
		const deceased = styles.find((s) => s.selector === 'node.deceased')?.style ?? {};
		expect(deceased).toMatchObject({ 'border-style': 'double', 'border-color': p.fgSubtle });
		for (const fade of ['opacity', 'background-opacity', 'border-opacity', 'text-opacity']) {
			expect({ fade, value: deceased[fade] }).toEqual({ fade, value: undefined });
		}
	});

	it('writes a circle’s name in the text colour, its tint carrying the circle colour', () => {
		const p = resolvePalette(read);
		const circle = styles.find((s) => s.selector === 'node.circle')?.style ?? {};
		expect(circle.color).toBe(p.fg);
		expect(circle['border-color']).toBe(p.membership);
	});

	it('lays a "+N" badge over the corner of a node that can still grow', () => {
		const rule = styles.find((s) => s.selector === `node.${HAS_MORE_CLASS}`)?.style ?? {};
		const image = rule['background-image'] as (ele: { data(key: string): unknown }) => string[];
		const images = image({ data: (key) => ({ more: 5 })[key] });
		expect(images).toHaveLength(1);
		expect(decodeURIComponent(images[0])).toContain('>+5<');
		// Drawn over the node's edge, not clipped to its disc.
		expect(rule['background-clip']).toBe('none');
		expect(rule['background-image-containment']).toBe('over');
	});

	it('keeps the photo under the badge for a person who has both', () => {
		const rule = styles.find((s) => s.selector === `node.has-photo.${HAS_MORE_CLASS}`)?.style ?? {};
		const image = rule['background-image'] as (ele: { data(key: string): unknown }) => string[];
		const images = image({ data: (key) => ({ more: 2, photo: '/media/p?thumb' })[key] });
		expect(images[0]).toBe('/media/p?thumb');
		expect(decodeURIComponent(images[1])).toContain('>+2<');
		expect(rule['background-clip']).toEqual(['node', 'none']);
	});

	it('names every edge at once when edge labels are asked for', () => {
		const shown = buildStylesheet(resolvePalette(read), { edgeLabels: true });
		const edge = shown.find((s) => s.selector === 'edge');
		expect(edge?.style).toMatchObject({ label: 'data(label)', 'text-opacity': 1 });
	});

	it('drops edge labels that zoom out too small to read, in either mode', () => {
		for (const on of [false, true]) {
			const edge = buildStylesheet(resolvePalette(read), { edgeLabels: on }).find(
				(s) => s.selector === 'edge'
			);
			expect(edge?.style['min-zoomed-font-size']).toBe(LABEL_MIN_ZOOMED_FONT_SIZE);
		}
	});

	it('thickens the lines of a traced path without squashing the people on it', () => {
		// `width` is a line's thickness but a node's size: set on both, the path's people
		// were drawn three pixels wide.
		const nodeRules = styles.filter((s) => /(^|,\s*)(node)?\.onpath/.test(s.selector));
		for (const rule of nodeRules) expect(rule.style.width).toBeUndefined();
		expect(styles.find((s) => s.selector === 'edge.onpath')?.style.width).toBe(3);
	});

	it('rings the node the keyboard is on in the focus colour, outside its own border', () => {
		const cursor = styles.find((s) => s.selector === `node.${CURSOR_CLASS}`);
		expect(cursor?.style).toMatchObject({
			'outline-color': resolvePalette(read).focusRing,
			'outline-width': 3
		});
	});

	it('changes state at once under reduced motion, and eases otherwise', () => {
		const durations = (sheet: ReturnType<typeof buildStylesheet>) =>
			sheet.map((s) => s.style['transition-duration']).filter((d) => d !== undefined);
		expect(durations(styles)).not.toContain('0ms');
		const still = durations(buildStylesheet(resolvePalette(read), { reducedMotion: true }));
		expect(still.length).toBeGreaterThan(0);
		expect(new Set(still)).toEqual(new Set(['0ms']));
	});

	it('gives every person accent its own background selector', () => {
		expect(has('node.person[accent = "mauve"]')).toBe(true);
		expect(has('node.person[accent = "green"]')).toBe(true);
	});

	it('draws a photo on a person who has one, clipped to the disc', () => {
		const photo = styles.find((s) => s.selector === 'node.person.has-photo');
		expect(photo?.style).toMatchObject({
			'background-image': 'data(photo)',
			'background-fit': 'cover'
		});
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
