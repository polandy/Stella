import { RELATIONSHIP_CATEGORIES } from '../../relationships/categories';
import { LABEL_MIN_ZOOMED_FONT_SIZE, SMALLEST_LABEL_FONT_SIZE } from '../layout/legibility';
import { BOW_FIELD, BOWED_CLASS, ROUTE_FIELDS, ROUTED_CLASS } from './canvas-classes';
import type { CyStyle, StyleContext, StyledElement } from './stylesheet';

/* The lines of the graph stylesheet (docs/05 §5.8): their kinds, bends and routes. */

/**
 * How far up a routed line's name sits from the person its last drop comes down to, in model
 * units: clear of the disc's rim below and of the bar above, which is never closer than about
 * twice this (`tree-lines.ts`).
 */
const ROUTE_NAME_OFFSET = 22;

/** Each line is drawn in one colour, its arrowhead included (docs/05 §5.8). */
export const lineColour = (hex: string) => ({ 'line-color': hex, 'target-arrow-color': hex });

export function edgeStyles({ p, options, transition }: StyleContext): CyStyle[] {
	// A routed line reads its bends and ends off its own data (`segments.ts`).
	const field = (name: string) => (ele: StyledElement) => ele.data(name);
	const nameAt = (end: 'source' | 'target') => (ele: StyledElement) =>
		ele.data(ROUTE_FIELDS.nameEnd) === end ? String(ele.data('label') ?? '') : '';

	return [
		// ── Edges ─────────────────────────────────────────────────────────────
		// Opaque on purpose: each line colour is deepened until it clears 3:1 on the page ground
		// (docs/05 §5.8), and drawing it see-through would undo exactly that.
		{
			selector: 'edge',
			style: {
				width: 1.6,
				'curve-style': 'bezier',
				...lineColour(p.lines.categories.other),
				// Every line knows its name ("Parent of", "Grandfather"). Named all at once only when
				// the caller asks (see `edgeLabels`); otherwise a name shows while its line is
				// highlighted, hovered or traced, so pointing at a person still names their lines.
				label: 'data(label)',
				'text-opacity': options.edgeLabels ? 1 : 0,
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				color: p.fgMuted,
				'font-size': SMALLEST_LABEL_FONT_SIZE,
				'font-family': p.fontSans,
				'text-background-color': p.bg,
				'text-background-opacity': 0.8,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '2px',
				'text-rotation': 'autorotate',
				'transition-property': 'opacity, width, line-color',
				'transition-duration': transition
			}
		},
		// Lines take the canvas-safe depth of their token: an edge carries its category alone.
		{ selector: 'edge[category = "family"]', style: lineColour(p.lines.categories.family) },
		{ selector: 'edge[category = "romantic"]', style: lineColour(p.lines.categories.romantic) },
		{ selector: 'edge[category = "social"]', style: lineColour(p.lines.categories.social) },
		{
			selector: 'edge[category = "professional"]',
			style: lineColour(p.lines.categories.professional)
		},
		{
			selector: 'edge[kind = "membership"]',
			style: {
				...lineColour(p.lines.membership),
				'line-style': 'dashed',
				'line-dash-pattern': [4, 4]
			}
		},
		// Inferred, so lighter: thinner and dotted rather than see-through, which keeps it at 3:1.
		{
			selector: 'edge[kind = "kinship"]',
			style: { ...lineColour(p.lines.kinship), 'line-style': 'dotted', width: 1.2 }
		},
		// A link marked former (docs/02 §2.7): still a link, so still in its category's hue, but
		// muted toward the grey, thinner, and dashed longer than a circle's line so the two never
		// read alike. Its name says "former" too, so the mark holds without colour.
		{
			selector: 'edge.former',
			style: { width: 1.2, 'line-style': 'dashed', 'line-dash-pattern': [9, 4] }
		},
		...RELATIONSHIP_CATEGORIES.map((c) => ({
			selector: `edge.former[category = "${c}"]`,
			style: lineColour(p.lines.former[c])
		})),
		{
			selector: 'edge[directed = 1]',
			style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8 }
		},
		// One line standing in for several (docs/02 §2.7): thicker the more it carries, and it
		// always says how many, since that count is the one thing the bundle adds.
		{
			selector: 'edge.bundle',
			style: { width: 'mapData(count, 2, 12, 3, 7)', 'text-opacity': 1 }
		},
		// A line an arrangement bends around whoever stands in its way (docs/05 §5.8): its bow
		// is the control point's sideways offset, set by the controller.
		{
			selector: `edge.${BOWED_CLASS}`,
			style: {
				'curve-style': 'unbundled-bezier',
				'control-point-distances': `data(${BOW_FIELD})`,
				'control-point-weights': 0.5
			}
		},
		// A family line the tree draws at right angles (docs/05 §5.8): straight pieces through the
		// bends the controller set, measured from the node centres. Up and down already say who is
		// whose parent, so no arrowhead; its colour, dots and width stay those of its kind.
		{
			selector: `edge.${ROUTED_CLASS}`,
			style: {
				'curve-style': 'segments',
				'edge-distances': 'node-position',
				'segment-weights': field(ROUTE_FIELDS.weights),
				'segment-distances': field(ROUTE_FIELDS.distances),
				'source-endpoint': field(ROUTE_FIELDS.sourceEndpoint),
				'target-endpoint': field(ROUTE_FIELDS.targetEndpoint),
				'target-arrow-shape': 'none',
				// Named on its last drop, just over the person it comes down to — never in the
				// middle, which may be a bar its siblings' lines share or a junction — and only
				// once a drop: a child's two parents' lines run down the same one.
				label: '',
				'source-label': nameAt('source'),
				'target-label': nameAt('target'),
				'source-text-offset': ROUTE_NAME_OFFSET,
				'target-text-offset': ROUTE_NAME_OFFSET,
				'source-text-rotation': 'none',
				'target-text-rotation': 'none'
			}
		}
	];
}
