import { BRIDGE_OVER_CLASS } from './canvas-classes';
import type { CyStyle, StyleContext } from './stylesheet';

/*
 * A parent line's stroke says its kind (docs/dev/05 §5.8): solid biological, double adoptive,
 * dash-dot foster, short-dash step; and the line that crosses a bar over a bridge.
 */

const adoptive = 'edge[parentKind = "adoptive"]';
/** An adoptive line's rims: the outline drawn around its ground-coloured core. */
const DOUBLE_RIMS = 3.4;

/** The kinds' strokes, after the former rules so an ended foster family keeps its dash-dot. */
export function parentKindStyles({ p }: StyleContext): CyStyle[] {
	return [
		{
			selector: 'edge[parentKind = "foster"]',
			style: { 'line-style': 'dashed', 'line-dash-pattern': [9, 3, 2, 3] }
		},
		{
			selector: 'edge[parentKind = "step"]',
			style: { 'line-style': 'dashed', 'line-dash-pattern': [4, 4] }
		},
		{
			selector: adoptive,
			style: {
				'line-style': 'solid',
				'line-color': p.bg,
				'target-arrow-color': p.lines.categories.family,
				width: 1.8,
				'line-outline-width': DOUBLE_RIMS,
				'line-outline-color': p.lines.categories.family
			}
		},
		{
			selector: `${adoptive}.former`,
			style: {
				width: 1.2,
				'line-outline-width': 2.4,
				'line-outline-color': p.lines.former.family,
				'target-arrow-color': p.lines.former.family
			}
		},
		{ selector: `edge.${BRIDGE_OVER_CLASS}`, style: { 'z-index': 2 } }
	];
}

/** After the interaction states: a highlighted or traced adoptive line stays double. */
export function parentKindStates({ p }: StyleContext): CyStyle[] {
	return [
		{ selector: `${adoptive}.highlight`, style: { width: 2.2 } },
		{
			selector: `${adoptive}.onpath`,
			style: {
				width: 2.2,
				'line-color': p.bg,
				'line-outline-color': p.lines.path,
				'target-arrow-color': p.lines.path
			}
		}
	];
}
