import { CURSOR_CLASS, HOVERED_CLASS, TUCKED_CLASS } from './canvas-classes';
import { edgeStyles, lineColour } from './stylesheet-edges';
import { markStyles, nodeStyles } from './stylesheet-nodes';
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
export interface StyledElement {
	data(key: string): unknown;
}

/** What every part of the stylesheet is drawn from. */
export interface StyleContext {
	p: Palette;
	options: StylesheetOptions;
	/** Drawn as the family tree (`StylesheetOptions.familyTree`). */
	tree: boolean;
	/** How long a state change takes: none when the reader asked for less motion. */
	transition: string;
}

export function buildStylesheet(p: Palette, options: StylesheetOptions = {}): CyStyle[] {
	const context: StyleContext = {
		p,
		options,
		tree: options.familyTree === true,
		transition: options.reducedMotion ? '0ms' : '150ms'
	};
	const { tree } = context;

	return [
		...nodeStyles(context),
		...edgeStyles(context),
		...markStyles(context),
		// ── Interaction states (toggled as classes by the controller) ─────────
		{
			selector: '.highlight',
			style: { opacity: 1, width: 2.6, 'border-color': p.focusRing, 'z-index': 20 }
		},
		{ selector: `edge.${HOVERED_CLASS}`, style: { width: 2.6, 'z-index': 25 } },
		// A former line lifts too, but stays thinner than a current one beside it, so touching
		// the selected person does not make it read as current (its dash is kept as is).
		{ selector: `edge.former.highlight, edge.former.${HOVERED_CLASS}`, style: { width: 1.8 } },
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
			style: { opacity: 1, width: 3, ...lineColour(p.lines.path), 'z-index': 30 }
		},
		{
			selector: 'node.onpath',
			style: { opacity: 1, 'border-color': p.lines.path, 'border-width': 5, 'z-index': 30 }
		}
	];
}
