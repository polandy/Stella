import { mixHex } from '../../design/color';
import { FRAME } from '../layout/group-blocks';
import { LABEL_MIN_ZOOMED_FONT_SIZE, NODE_LABEL_WIDTH } from '../layout/legibility';
import { expandBadge } from './badge';
import type { Palette } from './theme';

/** The class and data field a bent line carries; the controller sets them, this draws them. */
export const BOWED_CLASS = 'bowed';
export const BOW_FIELD = 'bow';
/** The class a line a bundle stands for carries (docs/02 §2.7); drawn only while selected. */
export const TUCKED_CLASS = 'tucked';
/** The class the node the keyboard is on carries (docs/05 §5.8); the controller sets it. */
export const CURSOR_CLASS = 'cursor';
/** The class a line carries while the pointer rests on it or on either of its ends. */
export const HOVERED_CLASS = 'hovered';
/** The class a node carries while expanding it would bring more people in (`elements.ts`). */
export const HAS_MORE_CLASS = 'has-more';
/**
 * The class a line drawn at right angles carries, and the data fields its bends and ends are
 * read from (`segments.ts`); the controller sets them, this draws them.
 */
export const ROUTED_CLASS = 'routed';
export const ROUTE_FIELDS = {
	weights: 'segmentWeights',
	distances: 'segmentDistances',
	sourceEndpoint: 'sourceEndpoint',
	targetEndpoint: 'targetEndpoint',
	nameEnd: 'nameEnd'
} as const;
/**
 * How far up a routed line's name sits from the person its last drop comes down to, in model
 * units: clear of the disc's rim below and of the bar above, which is never closer than about
 * twice this (`tree-lines.ts`).
 */
const ROUTE_NAME_OFFSET = 22;
/** The class of a caption the controller writes onto the canvas: words, not somebody to tap. */
export const CAPTION_CLASS = 'caption';

/*
 * Build the Cytoscape stylesheet from a resolved Palette (docs/05 §5.8). Pure: palette in,
 * style array out — so it tests without the library and re-themes by swapping the palette.
 * Every colour comes from the semantic tokens; nothing hard-codes a hex.
 */

/** Loosely-typed Cytoscape style entry (keeps the library out of pure code). */
export interface CyStyle {
	selector: string;
	style: Record<string, unknown>;
}

/** How the caller wants the canvas drawn, beyond the colours. */
export interface StylesheetOptions {
	/**
	 * Name every line at once, not just the highlighted, hovered or traced ones. The caller
	 * decides: the Labels switch is on by default, but past a few dozen lines the names pile
	 * up around a hub, so it is off whenever they no longer fit (`edgeLabelsFit`, docs/05 §5.8).
	 */
	edgeLabels?: boolean;
	/** The reader asked for less motion: a state change (selection, fading) is then instant. */
	reducedMotion?: boolean;
	/**
	 * Drawn as the family tree around a person (docs/05 §5.8): each person's role towards the
	 * centre is written under their name (the `role` the elements carry), the centre is lit
	 * softly, and no line is named unless `edgeLabels` asks for it — the roles say it instead.
	 */
	familyTree?: boolean;
}

/** The element accessor a function-valued style reads; Cytoscape hands it the element. */
interface StyledElement {
	data(key: string): unknown;
}

export function buildStylesheet(p: Palette, options: StylesheetOptions = {}): CyStyle[] {
	const transition = options.reducedMotion ? '0ms' : '150ms';
	// One badge image per count, built once per palette: every node with "+3" shares it.
	const badges = new Map<number, string>();
	const badgeOf = (ele: StyledElement): string => {
		const count = Number(ele.data('more'));
		let uri = badges.get(count);
		if (uri === undefined) {
			uri = expandBadge(count, { fill: p.card, text: p.fg, ring: p.fgSubtle }).uri;
			badges.set(count, uri);
		}
		return uri;
	};
	// Each line is drawn in one colour, its arrowhead included (docs/05 §5.8).
	const line = (hex: string) => ({ 'line-color': hex, 'target-arrow-color': hex });
	const tree = options.familyTree === true;
	// In the tree a person's role goes on a second line under the name ("Father").
	const nameAndRole = (ele: StyledElement): string => {
		const name = String(ele.data('label') ?? '');
		const role = String(ele.data('role') ?? '');
		return role ? `${name}\n${role}` : name;
	};
	// A routed line reads its bends and ends off its own data (`segments.ts`).
	const field = (name: string) => (ele: StyledElement) => ele.data(name);
	const nameAt = (end: 'source' | 'target') => (ele: StyledElement) =>
		ele.data(ROUTE_FIELDS.nameEnd) === end ? String(ele.data('label') ?? '') : '';

	return [
		// ── People ────────────────────────────────────────────────────────────
		{
			selector: 'node.person',
			style: {
				'background-color': p.card, // overridden per-accent below
				// The diameter the elements carry: a square-root scale of the lines on the map.
				width: 'data(size)',
				height: 'data(size)',
				label: tree ? nameAndRole : 'data(label)',
				color: p.fg,
				'font-size': 11,
				'font-family': p.fontSans,
				'text-valign': 'bottom',
				'text-margin-y': 6,
				'text-max-width': `${NODE_LABEL_WIDTH}px`,
				// Cutting short works on one line only; the name and its role are two.
				'text-wrap': tree ? 'wrap' : 'ellipsis',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				'border-width': 3,
				'text-background-color': p.bg,
				'text-background-opacity': 0.65,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '2px',
				'transition-property': 'opacity, border-width, border-color',
				'transition-duration': transition
			}
		},
		// The same disc as the avatar component (docs/05 §5.10): the accent tints the card and
		// rings the node, so a face keeps its colour between the list and the map.
		...Object.entries(p.accents).map(([name, hex]) => ({
			selector: `node.person[accent = "${name}"]`,
			style: { 'background-color': mixHex(hex, p.avatarTint, p.card), 'border-color': hex }
		})),
		// A person with a photo wears it, clipped to the disc; the accent stays as the border.
		{
			selector: 'node.person.has-photo',
			style: {
				'background-image': 'data(photo)',
				'background-fit': 'cover',
				'background-clip': 'node',
				'background-image-crossorigin': 'use-credentials'
			}
		},
		{
			selector: 'node.center',
			style: { 'border-color': p.primary, 'border-width': 4, 'font-weight': 600, 'z-index': 10 }
		},
		// The tree is read from its centre outwards: a soft glow around the ring finds it at once.
		// Fainter than a selection's halo, which still wins when the centre is selected.
		...(tree
			? [
					{
						selector: 'node.center',
						style: {
							'underlay-color': p.primary,
							'underlay-opacity': 0.15,
							'underlay-padding': 10,
							'underlay-shape': 'ellipse'
						}
					}
				]
			: []),
		// Somebody who has died keeps their full weight on the map — a faded disc read as "not
		// really there" — and is told apart by colour drained to the neutral grey and a double
		// ring, so the mark holds without colour too.
		{
			selector: 'node.deceased',
			style: {
				'background-color': mixHex(p.fgSubtle, p.avatarTint, p.card),
				'border-color': p.fgSubtle,
				'border-style': 'double',
				'border-width': 5
			}
		},
		// ── Circles (shared contexts) — a distinct pill shape ─────────────────
		// The tint and the ring carry the circle colour; the name is written in the text colour,
		// as on a chip, because lavender words on a lavender tint fell under AA in Latte.
		{
			selector: 'node.circle',
			style: {
				shape: 'round-rectangle',
				'background-color': mixHex(p.membership, 20, p.card),
				'border-color': p.membership,
				'border-width': 2,
				width: 'label',
				height: 28,
				padding: '8px',
				label: 'data(label)',
				color: p.fg,
				'font-size': 11,
				'font-weight': 600,
				'text-valign': 'center',
				'text-halign': 'center',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE
			}
		},
		// ── Groups by role (docs/02 §2.7) — a frame around the members ─────────
		// Cytoscape sizes a compound node around its members; the role and count sit on top.
		{
			selector: 'node.role-group',
			style: {
				shape: 'round-rectangle',
				'background-color': mixHex(p.membership, 8, p.card),
				'background-opacity': 0.7,
				'border-color': p.membership,
				'border-width': 1.5,
				padding: `${FRAME.padding}px`,
				label: 'data(label)',
				color: p.fg,
				'font-size': 11,
				'font-weight': 600,
				'font-family': p.fontSans,
				'text-valign': 'top',
				'text-halign': 'center',
				'text-margin-y': -4,
				'text-background-color': p.bg,
				'text-background-opacity': 0.85,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '3px',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				'compound-sizing-wrt-labels': 'include',
				'transition-property': 'opacity, border-width, border-color',
				'transition-duration': transition
			}
		},
		// ── "+N": expanding this node would bring more people in ──────────────
		// A small pill over the node's upper right edge, drawn as an image because the canvas
		// has no DOM. It sits outside the disc (`containment: over`), so a photo stays whole.
		{
			selector: `node.${HAS_MORE_CLASS}`,
			style: {
				'background-image': (ele: StyledElement) => [badgeOf(ele)],
				'background-fit': 'none',
				'background-clip': 'none',
				'background-image-containment': 'over',
				'background-width': 'auto',
				'background-height': 'auto',
				'background-position-x': '100%',
				'background-position-y': '0%',
				'background-offset-x': 10,
				'background-offset-y': -6,
				'bounds-expansion': 16
			}
		},
		{
			selector: `node.has-photo.${HAS_MORE_CLASS}`,
			style: {
				'background-image': (ele: StyledElement) => [String(ele.data('photo')), badgeOf(ele)],
				'background-fit': ['cover', 'none'],
				'background-clip': ['node', 'none'],
				'background-image-containment': ['inside', 'over'],
				'background-width': ['auto', 'auto'],
				'background-height': ['auto', 'auto'],
				'background-position-x': ['50%', '100%'],
				'background-position-y': ['50%', '0%'],
				'background-offset-x': [0, 10],
				'background-offset-y': [0, -6]
			}
		},
		// ── Edges ─────────────────────────────────────────────────────────────
		// Opaque on purpose: each line colour is deepened until it clears 3:1 on the page ground
		// (docs/05 §5.8), and drawing it see-through would undo exactly that.
		{
			selector: 'edge',
			style: {
				width: 1.6,
				'curve-style': 'bezier',
				...line(p.lines.categories.other),
				// Every line knows its name ("Parent of", "Grandfather"). Named all at once only when
				// the caller asks (see `edgeLabels`); otherwise a name shows while its line is
				// highlighted, hovered or traced, so pointing at a person still names their lines.
				label: 'data(label)',
				'text-opacity': options.edgeLabels ? 1 : 0,
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				color: p.fgMuted,
				'font-size': 10,
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
		{ selector: 'edge[category = "family"]', style: line(p.lines.categories.family) },
		{ selector: 'edge[category = "romantic"]', style: line(p.lines.categories.romantic) },
		{ selector: 'edge[category = "social"]', style: line(p.lines.categories.social) },
		{ selector: 'edge[category = "professional"]', style: line(p.lines.categories.professional) },
		{
			selector: 'edge[kind = "membership"]',
			style: { ...line(p.lines.membership), 'line-style': 'dashed', 'line-dash-pattern': [4, 4] }
		},
		// Inferred, so lighter: thinner and dotted rather than see-through, which keeps it at 3:1.
		{
			selector: 'edge[kind = "kinship"]',
			style: { ...line(p.lines.kinship), 'line-style': 'dotted', width: 1.2 }
		},
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
		},
		// ── A caption the controller writes onto the canvas ───────────────────
		// "Outside the family" over the shelf beneath the tree: quiet words, nobody to tap.
		{
			selector: `node.${CAPTION_CLASS}`,
			style: {
				width: 1,
				height: 1,
				'background-opacity': 0,
				'border-width': 0,
				label: 'data(label)',
				color: p.fgMuted,
				'font-size': 11,
				'font-family': p.fontSans,
				'text-valign': 'center',
				'text-halign': 'right',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				events: 'no'
			}
		},
		// ── Interaction states (toggled as classes by the controller) ─────────
		{
			selector: '.highlight',
			style: { opacity: 1, width: 2.6, 'border-color': p.focusRing, 'z-index': 20 }
		},
		{ selector: `edge.${HOVERED_CLASS}`, style: { width: 2.6, 'z-index': 25 } },
		{
			selector: `edge.highlight, edge.onpath, edge.${HOVERED_CLASS}`,
			style: { 'text-opacity': 1 }
		},
		// In the tree the role under each name says what the names on the lines would — "Friend"
		// under Nicole rather than "Friend of" on her line — so until the reader turns the Labels
		// switch on there, no line is named, not even selected or pointed at (`tree-view.ts`).
		...(tree && !options.edgeLabels ? [{ selector: 'edge', style: { 'text-opacity': 0 } }] : []),
		// The selection is a filled halo around a solid ring; the keyboard's cursor (below) a
		// dashed ring held off the node. Two shapes, so they never read as one — not even for
		// someone who cannot tell their colours apart.
		{
			selector: 'node.selected',
			style: {
				'border-color': p.focusRing,
				'border-width': 4,
				'underlay-color': p.focusRing,
				'underlay-opacity': 0.3,
				'underlay-padding': 8,
				'underlay-shape': 'ellipse'
			}
		},
		{
			selector: `node.${CURSOR_CLASS}`,
			style: {
				'outline-color': p.focusRing,
				'outline-width': 3,
				'outline-style': 'dashed',
				'outline-offset': 5,
				'outline-opacity': 1
			}
		},
		{ selector: '.faded', style: { opacity: 0.12 } },
		// Stepping onto a faded node lifts it, or the ring would fade with it.
		{ selector: `node.faded.${CURSOR_CLASS}`, style: { opacity: 1 } },
		// A line a bundle stands for, or a link inside a group with those switched off, shows
		// only while its node is selected or it is on a traced path.
		{ selector: `edge.${TUCKED_CLASS}`, style: { display: 'none' } },
		{
			selector: `edge.${TUCKED_CLASS}.highlight, edge.${TUCKED_CLASS}.onpath`,
			style: { display: 'element' }
		},
		{ selector: '.filtered-out', style: { display: 'none' } },
		// Split by kind: `width` is a line's thickness but a node's size.
		{
			selector: 'edge.onpath',
			style: { opacity: 1, width: 3, ...line(p.lines.path), 'z-index': 30 }
		},
		{
			selector: 'node.onpath',
			style: { opacity: 1, 'border-color': p.lines.path, 'border-width': 5, 'z-index': 30 }
		}
	];
}
