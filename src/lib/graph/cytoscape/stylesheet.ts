import { mixHex } from '../../design/color';
import { AVATAR_TINT_PERCENT } from '../../design/tokens';
import type { Palette } from './theme';

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

export function buildStylesheet(p: Palette): CyStyle[] {
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
		// ── Edges ─────────────────────────────────────────────────────────────
		{
			selector: 'edge',
			style: {
				width: 1.6,
				'curve-style': 'bezier',
				'line-color': p.fgSubtle,
				opacity: 0.6,
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
		// ── Interaction states (toggled as classes by the controller) ─────────
		{
			selector: '.highlight',
			style: { opacity: 1, width: 2.6, 'border-color': p.focusRing, 'z-index': 20 }
		},
		{ selector: 'node.selected', style: { 'border-color': p.focusRing, 'border-width': 5 } },
		{ selector: '.faded', style: { opacity: 0.12 } },
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
