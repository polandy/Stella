import type { Core, NodeSingular } from 'cytoscape';
import type { Arrangement, Point } from '../layout/geometry';
import { segmentsOf } from './segments';
import { BOW_FIELD, BOWED_CLASS, CAPTION_CLASS, ROUTE_FIELDS, ROUTED_CLASS } from './stylesheet';

/*
 * What the canvas does for the arranged maps beyond moving people (docs/05 §5.8): bending and
 * routing their lines, and writing the family tree's "Outside the family" caption. Split from
 * `explorer.ts`, which drives the core and calls these; like the controller's other parts, it
 * touches the library only inside `cytoscape/`, and holds no domain rules.
 */

/** The words an arrangement's caption reads, in the viewer's language. */
export interface Captions {
	/** Over the shelf of people outside the family, beneath the family tree. */
	outsideFamily?: string;
	/**
	 * Never frame so far out that the names stop being drawn (`legibleZoom`): the family tree,
	 * whose roles are what it is read by. The other arrangements frame the whole map.
	 */
	keepNamesDrawn?: boolean;
}

/** The one caption on the canvas; it is the controller's, never one of the elements. */
export const CAPTION_ID = 'caption:outside-family';
/** How far above the shelf its caption stands, in model units — clear of the first row. */
const CAPTION_ABOVE = 16;

/**
 * Bends exactly the lines in `bows`, routes exactly those in `routes`, and straightens every
 * other. A route's bends are measured from where its two people are going (`placeOf`), not
 * where they stand mid-glide: they are only right once the glide has arrived.
 */
export function bendLines(
	cy: Core,
	{ bows, routes }: Pick<Arrangement, 'bows' | 'routes'>,
	placeOf: (node: NodeSingular) => Point
): void {
	cy.batch(() => {
		cy.edges().forEach((edge) => {
			const route = routes?.get(edge.id());
			if (route) {
				const segments = segmentsOf(route, placeOf(edge.source()), placeOf(edge.target()));
				edge.data({
					[ROUTE_FIELDS.weights]: segments.weights,
					[ROUTE_FIELDS.distances]: segments.distances,
					[ROUTE_FIELDS.sourceEndpoint]: segments.sourceEndpoint,
					[ROUTE_FIELDS.targetEndpoint]: segments.targetEndpoint,
					[ROUTE_FIELDS.nameEnd]: route.nameEnd
				});
				edge.removeClass(BOWED_CLASS);
				edge.addClass(ROUTED_CLASS);
				return;
			}
			edge.removeClass(ROUTED_CLASS);
			const bow = bows.get(edge.id());
			if (bow === undefined) {
				edge.removeClass(BOWED_CLASS);
			} else {
				edge.data(BOW_FIELD, bow);
				edge.addClass(BOWED_CLASS);
			}
		});
	});
}

/**
 * Writes the shelf's caption where `at` says the shelf begins, or takes it away, and says where
 * it is to stand. It is words on the canvas, not somebody: no tap reaches it (`events: no`),
 * nobody drags it, and the keyboard, the framing and the filters all pass it by.
 */
export function writeCaption(
	cy: Core,
	at: Point | undefined,
	words: string | undefined
): Map<string, Point> {
	const existing = cy.$id(CAPTION_ID);
	if (!at || !words) {
		existing.remove();
		return new Map();
	}
	const place = { x: at.x, y: at.y - CAPTION_ABOVE };
	if (existing.empty()) {
		cy.add({
			group: 'nodes',
			data: { id: CAPTION_ID, label: words },
			classes: CAPTION_CLASS,
			position: { ...place }
		}).ungrabify();
	} else {
		existing.data('label', words);
	}
	return new Map([[CAPTION_ID, place]]);
}
