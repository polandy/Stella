import type { Core, NodeSingular } from 'cytoscape';
import type { Arrangement, Bridge, Point, Shelf } from '../layout/geometry';
import { segmentsOf } from './segments';
import {
	BOW_FIELD,
	BOWED_CLASS,
	BRIDGE_CLASS,
	BRIDGE_OVER_CLASS,
	CAPTION_CLASS,
	CAPTION_RULE_CLASS,
	DOTTED_CLASS,
	ROUTE_FIELDS,
	ROUTED_CLASS
} from './canvas-classes';

/*
 * What the canvas does for the arranged maps beyond moving people (docs/dev/05 §5.8): bending and
 * routing their lines, masking a bar where another line crosses it, and writing the family tree's "Outside the family" caption and its rule. Split from
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
	/** Whom `keepNamesDrawn` frames first: the centre's core family; else the whole family. */
	coreFamily?: ReadonlySet<string>;
	/** A drag keeps to the person's row and reports its drop (`tree-dragging.ts`): the tree. */
	rowDrags?: boolean;
}

/** The one caption on the canvas; it is the controller's, never one of the elements. */
export const CAPTION_ID = 'caption:outside-family';
/** The thin rule over it, across the family's width. */
export const CAPTION_RULE_ID = 'caption:outside-family:rule';
/** How far above the shelf its caption stands, in model units — clear of the first row. */
const CAPTION_ABOVE = 16;
/** How far above the caption its rule runs. */
const RULE_ABOVE = 16;

/**
 * Bends exactly the lines in `bows`, routes exactly those in `routes`, and straightens every
 * other; dots exactly those in `dottedLines`. A route's bends are measured from where its two people are going (`placeOf`), not
 * where they stand mid-glide: they are only right once the glide has arrived.
 */
export function bendLines(
	cy: Core,
	{ bows, routes, dottedLines }: Pick<Arrangement, 'bows' | 'routes' | 'dottedLines'>,
	placeOf: (node: NodeSingular) => Point
): void {
	cy.batch(() => {
		cy.edges().forEach((edge) => {
			edge.toggleClass(DOTTED_CLASS, dottedLines?.has(edge.id()) === true);
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
 * Writes the shelf's caption, and the thin rule over it, where `at` says the shelf begins, or
 * takes them away, and says where they are to stand. They are marks on the canvas, not somebody:
 * no tap reaches them (`events: no`), nobody drags them, and the keyboard, the framing and the
 * filters all pass them by.
 */
export function writeCaption(
	cy: Core,
	at: Shelf | undefined,
	words: string | undefined
): Map<string, Point> {
	const caption = cy.$id(CAPTION_ID);
	const rule = cy.$id(CAPTION_RULE_ID);
	if (!at || !words) {
		caption.union(rule).remove();
		return new Map();
	}
	const place = { x: at.x, y: at.y - CAPTION_ABOVE };
	const ruleAt = { x: at.x + at.width / 2, y: place.y - RULE_ABOVE };
	if (caption.empty()) {
		cy.add({
			group: 'nodes',
			data: { id: CAPTION_ID, label: words },
			classes: CAPTION_CLASS,
			position: { ...place }
		}).ungrabify();
	} else {
		caption.data('label', words);
	}
	if (rule.empty()) {
		cy.add({
			group: 'nodes',
			data: { id: CAPTION_RULE_ID, width: at.width },
			classes: `${CAPTION_CLASS} ${CAPTION_RULE_CLASS}`,
			position: { ...ruleAt }
		}).ungrabify();
	} else {
		rule.data('width', at.width);
	}
	return new Map([
		[CAPTION_ID, place],
		[CAPTION_RULE_ID, ruleAt]
	]);
}

/**
 * Writes a mask over the bar at each bridge, in the ground colour, and lifts each line crossing
 * there above it; takes away the masks no bridge needs any more. Captions like the shelf's: no
 * tap, no drag, and the keyboard, framing and filters pass them by. Says where each stands.
 */
export function writeBridges(cy: Core, bridges: readonly Bridge[] | undefined): Map<string, Point> {
	const places = new Map((bridges ?? []).map((b) => [`bridge:${b.at.x}:${b.at.y}`, b.at]));
	const over = new Set((bridges ?? []).flatMap((b) => b.over));
	cy.batch(() => {
		cy.nodes(`.${BRIDGE_CLASS}`)
			.filter((mask) => !places.has(mask.id()))
			.remove();
		for (const [id, at] of places) {
			if (cy.$id(id).empty()) {
				cy.add({
					group: 'nodes',
					data: { id },
					classes: `${CAPTION_CLASS} ${BRIDGE_CLASS}`,
					position: { ...at }
				}).ungrabify();
			}
		}
		cy.edges().forEach((edge) => {
			edge.toggleClass(BRIDGE_OVER_CLASS, over.has(edge.id()));
		});
	});
	return places;
}
