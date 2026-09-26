import { mixHex } from '../../design/color';
import { AVATAR_TINT_PERCENT } from '../../design/tokens';
import { FRAME } from '../layout/group-blocks';
import type { Palette } from './theme';

/** The class and data field a bent line carries; the controller sets them, this draws them. */
export const BOWED_CLASS = 'bowed';
export const BOW_FIELD = 'bow';
/** The class a line a bundle stands for carries (docs/02 §2.7); drawn only while selected. */
export const TUCKED_CLASS = 'tucked';

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

/**
 * Below this rendered font size (in screen pixels) Cytoscape drops a label. Zoomed far out,
 * edge names would otherwise pile into unreadable smudges over the lines they belong to.
 */
export const EDGE_LABEL_MIN_ZOOMED_FONT_SIZE = 7;

/** How the caller wants the canvas drawn, beyond the colours. */
export interface StylesheetOptions {
	/**
	 * Name every edge at once, not just the highlighted ones. Off by default: on a dense
	 * graph hundreds of names are noise, so the reader opts in (docs/05 §5.8).
	 */
	edgeLabels?: boolean;
}

export function buildStylesheet(p: Palette, options: StylesheetOptions = {}): CyStyle[] {
	return [
		// ── People ────────────────────────────────────────────────────────────
		{
			selector: 'node.person',
			style: {
				'background-color': p.card, // overridden per-accent below
				width: 'mapData(degree, 0, 10, 30, 56)',
				height: 'mapData(degree, 0, 10, 30, 56)',
				label: 'data(label)',
				color: p.fg,
				'font-size': 11,
				'font-family': p.fontSans,
				'text-valign': 'bottom',
				'text-margin-y': 6,
				'text-max-width': '96px',
				'text-wrap': 'ellipsis',
				'border-width': 3,
				'text-background-color': p.bg,
				'text-background-opacity': 0.65,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '2px',
				'transition-property': 'opacity, border-width, border-color',
				'transition-duration': '150ms'
			}
		},
		// The same disc as the avatar component (docs/05 §5.10): the accent tints the card and
		// rings the node, so a face keeps its colour between the list and the map.
		...Object.entries(p.accents).map(([name, hex]) => ({
			selector: `node.person[accent = "${name}"]`,
			style: { 'background-color': mixHex(hex, AVATAR_TINT_PERCENT, p.card), 'border-color': hex }
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
		{
			selector: 'node.deceased',
			style: { 'background-opacity': 0.45, 'border-opacity': 0.5 }
		},
		// ── Circles (shared contexts) — a distinct pill shape ─────────────────
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
				color: p.membership,
				'font-size': 11,
				'font-weight': 600,
				'text-valign': 'center',
				'text-halign': 'center'
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
				color: p.membership,
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
				'compound-sizing-wrt-labels': 'include',
				'transition-property': 'opacity, border-width, border-color',
				'transition-duration': '150ms'
			}
		},
		// ── Edges ─────────────────────────────────────────────────────────────
		{
			selector: 'edge',
			style: {
				width: 1.6,
				'curve-style': 'bezier',
				'line-color': p.fgSubtle,
				opacity: 0.6,
				// Every line knows its name ("Parent of", "Grandfather"), but hundreds of them at
				// once would be noise — so by default the label appears only while the edge is
				// highlighted, and selecting a person names their connections (docs/02 §2.7).
				// The toolbar's "Labels" toggle names them all for those who want the map read
				// at a glance.
				label: 'data(label)',
				'text-opacity': options.edgeLabels ? 1 : 0,
				'min-zoomed-font-size': EDGE_LABEL_MIN_ZOOMED_FONT_SIZE,
				color: p.fgMuted,
				'font-size': 10,
				'font-family': p.fontSans,
				'text-background-color': p.bg,
				'text-background-opacity': 0.8,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '2px',
				'text-rotation': 'autorotate',
				'transition-property': 'opacity, width, line-color',
				'transition-duration': '150ms'
			}
		},
		// Lines take the canvas-safe depth of their token: an edge carries its category alone.
		{ selector: 'edge[category = "family"]', style: { 'line-color': p.lines.categories.family } },
		{ selector: 'edge[category = "romantic"]', style: { 'line-color': p.lines.categories.romantic } },
		{ selector: 'edge[category = "social"]', style: { 'line-color': p.lines.categories.social } },
		{
			selector: 'edge[category = "professional"]',
			style: { 'line-color': p.lines.categories.professional }
		},
		{
			selector: 'edge[kind = "membership"]',
			style: { 'line-color': p.lines.membership, 'line-style': 'dashed', 'line-dash-pattern': [4, 4] }
		},
		{
			selector: 'edge[kind = "kinship"]',
			style: { 'line-color': p.lines.kinship, 'line-style': 'dotted', opacity: 0.45 }
		},
		{
			selector: 'edge[directed = 1]',
			style: {
				'target-arrow-shape': 'triangle',
				'target-arrow-color': p.fgSubtle,
				'arrow-scale': 0.8
			}
		},
		// One line standing in for several (docs/02 §2.7): thicker the more it carries, and it
		// always says how many, since that count is the one thing the bundle adds.
		{
			selector: 'edge.bundle',
			style: { width: 'mapData(count, 2, 12, 3, 7)', opacity: 0.85, 'text-opacity': 1 }
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
		// ── Interaction states (toggled as classes by the controller) ─────────
		{
			selector: '.highlight',
			style: { opacity: 1, width: 2.6, 'border-color': p.focusRing, 'z-index': 20 }
		},
		{ selector: 'edge.highlight, edge.onpath', style: { 'text-opacity': 1 } },
		{ selector: 'node.selected', style: { 'border-color': p.focusRing, 'border-width': 5 } },
		{ selector: '.faded', style: { opacity: 0.12 } },
		// A line a bundle stands for, or a link inside a group with those switched off, shows
		// only while its node is selected or it is on a traced path.
		{ selector: `edge.${TUCKED_CLASS}`, style: { display: 'none' } },
		{
			selector: `edge.${TUCKED_CLASS}.highlight, edge.${TUCKED_CLASS}.onpath`,
			style: { display: 'element' }
		},
		{ selector: '.filtered-out', style: { display: 'none' } },
		{
			selector: '.onpath',
			style: {
				opacity: 1,
				width: 3,
				'line-color': p.accents.yellow,
				'border-color': p.accents.yellow,
				'border-width': 5,
				'z-index': 30
			}
		}
	];
}
