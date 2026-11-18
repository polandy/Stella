import type { Core, NodeCollection, NodeSingular } from 'cytoscape';
import type { CyElement } from './elements';
import type { Size } from '../layout/geometry';
import { CAPTION_CLASS } from './canvas-classes';

/*
 * Which of the canvas's nodes are people, and how much room each takes — shared by the
 * controller's parts (`explorer.ts`), which place, frame and reconcile only people.
 */

/** What a group's frame carries as its kind (`elements.ts`). */
const FRAME_KIND = 'group';

/** Whether an element is the frame of a group by role rather than anybody in it. */
export const isFrame = (e: CyElement) => e.group === 'nodes' && e.data.kind === FRAME_KIND;

/**
 * Everything on the canvas but the frames of the groups by role and the caption: a frame stands
 * wherever its members do, so it is never placed, measured or put back by itself.
 */
export const peopleOn = (cy: Core) =>
	cy
		.nodes()
		.filter((n) => n.data('kind') !== FRAME_KIND && !n.hasClass(CAPTION_CLASS)) as NodeCollection;

/** How much room a node takes, its name included, in model units. */
export function sizeOf(node: NodeSingular): Size {
	const box = node.boundingBox({ includeLabels: true });
	return { width: box.w, height: box.h };
}

/** The room a layout gives a node: less the "+N" badge's reach, which a filter can take away. */
export function roomOf(node: NodeSingular): Size {
	const { width, height } = sizeOf(node);
	const reach = (node.numericStyle('bounds-expansion') as number[] | undefined) ?? [0];
	const [top, right = top, bottom = top, left = right] = reach;
	return { width: width - left - right, height: height - top - bottom };
}
