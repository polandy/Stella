import { LABEL_MIN_ZOOMED_FONT_SIZE } from '../layout/legibility';
import { CAPTION_CLASS, CAPTION_RULE_CLASS, SLOT_CLASS, SLOT_WORDED_CLASS } from './canvas-classes';
import type { CyStyle, StyleContext } from './stylesheet';
import { lineColour } from './stylesheet-edges';

/*
 * The marks of the graph stylesheet that are nobody (docs/dev/05 §5.8): a missing parent's or
 * aunt's slot and the canvas caption.
 */

/** A missing parent's slot and the canvas caption, drawn over the lines. */
export function markStyles({ p }: StyleContext): CyStyle[] {
	return [
		// ── A missing parent's slot in the family tree (docs/dev/05 §5.8) ─────────
		// Room for somebody not entered yet: a plus in a dashed ring, hollow so it never reads as
		// a person, and one dashed line tying it in. Muted, yet at 3:1 like every other line.
		{
			selector: `node.${SLOT_CLASS}`,
			style: {
				width: 'data(size)',
				height: 'data(size)',
				// Filled with the canvas: it stands over the child, where their drop may run in.
				'background-color': p.bg,
				'background-opacity': 1,
				'border-width': 1.5,
				'border-style': 'dashed',
				'border-color': p.fgMuted,
				label: 'data(label)',
				color: p.fgMuted,
				'font-size': 16,
				'font-family': p.fontSans,
				'text-valign': 'center',
				'text-halign': 'center',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE
			}
		},
		// An aunt or uncle over a group of cousins says what is missing: a dashed pill, no line.
		{
			selector: `node.${SLOT_WORDED_CLASS}`,
			style: {
				shape: 'round-rectangle',
				width: 'label',
				padding: '6px',
				'font-size': 12
			}
		},
		{
			selector: `edge.${SLOT_CLASS}`,
			style: {
				...lineColour(p.fgMuted),
				width: 1.2,
				'line-style': 'dashed',
				'line-dash-pattern': [4, 4],
				'target-arrow-shape': 'none'
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
		// The thin rule over it, across the family's width: sets the shelf off as aside.
		{
			selector: `node.${CAPTION_RULE_CLASS}`,
			style: {
				shape: 'rectangle',
				width: 'data(width)',
				height: 1,
				'background-color': p.border,
				'background-opacity': 1,
				label: ''
			}
		}
	];
}
