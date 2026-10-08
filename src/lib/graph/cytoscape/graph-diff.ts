import type { Core, ElementDefinition } from 'cytoscape';
import type { CyElement } from './elements';
import { isFrame, peopleOn } from './canvas-nodes';
import { placeNewcomers, type Placement, type Point } from './placement';
import { HAS_MORE_CLASS, TUCKED_CLASS } from './stylesheet';
import { CAPTION_ID } from './tree-canvas';

/*
 * Reconciling the canvas with a fresh element set: who stays keeps their place and takes on what
 * the elements now say about them, who is gone leaves, and the newcomers are placed clear of
 * everyone (docs/05 §5.8). Nobody is moved here beyond setting the newcomers down.
 */

/** The classes the elements decide, which an element already on the canvas takes on afresh. */
const SYNCED_CLASSES = [TUCKED_CLASS, HAS_MORE_CLASS];

export interface Reconciled {
	/** Where each newcomer is to stand, and the person it came from. */
	placements: Map<string, Placement>;
	/** How many people the element set brought in. */
	newcomers: number;
	/** Whether the canvas held nobody before them. */
	wasEmpty: boolean;
}

/**
 * Brings the canvas to `elements`. Newcomers are placed `edgeLength` out; with `startAtOrigin`
 * they are set down on the person they came from, to travel out from there, else at their place.
 */
export function reconcile(
	cy: Core,
	elements: CyElement[],
	{ edgeLength, startAtOrigin }: { edgeLength: number; startAtOrigin: boolean }
): Reconciled {
	const incoming = new Map(elements.map((e) => [e.data.id as string, e] as const));
	const newcomers = new Set<string>();
	let placements = new Map<string, Placement>();
	let wasEmpty = false;
	cy.batch(() => {
		// A frame goes in before anybody can be moved into it, and people leave a frame
		// before it goes: removing a compound node takes everyone still inside with it.
		cy.add(
			elements.filter(
				(e) => isFrame(e) && cy.$id(e.data.id as string).empty()
			) as unknown as ElementDefinition[]
		);
		cy.nodes().forEach((n) => {
			const wanted = incoming.get(n.id());
			if (!wanted || isFrame(wanted)) return;
			const parent = (wanted.data.parent as string | undefined) ?? null;
			const current = n.parent().nonempty() ? n.parent().first().id() : null;
			if (parent !== current) n.move({ parent });
		});
		cy.elements().forEach((el) => {
			const wanted = incoming.get(el.id());
			if (!wanted) {
				// The caption is the controller's own, never one of the elements.
				if (el.id() !== CAPTION_ID) el.remove();
				return;
			}
			// Switching the grouping keeps most elements, but tucks lines away or brings
			// them back, and recounts a group; an expand takes the "+N" off whoever has
			// nothing more behind them. Only what the elements own is synced: the
			// highlight, filter and bend classes belong to the controller.
			const owned = wanted.classes.split(' ');
			for (const name of SYNCED_CLASSES) el.toggleClass(name, owned.includes(name));
			const { id: _id, source: _s, target: _t, parent: _p, ...data } = wanted.data;
			el.data(data);
		});
		wasEmpty = peopleOn(cy).empty();
		const placed = new Map<string, Point>(
			peopleOn(cy).map((n) => [n.id(), { ...n.position() }] as const)
		);
		const existing = new Set(cy.elements().map((el) => el.id()));
		const toAdd = elements.filter((e) => !existing.has(e.data.id as string));
		if (toAdd.length === 0) return;
		for (const e of toAdd) if (e.group === 'nodes') newcomers.add(e.data.id as string);
		const links = elements
			.filter((e) => e.group === 'edges')
			.map((e) => ({ source: e.data.source as string, target: e.data.target as string }));
		placements = placeNewcomers(placed, [...newcomers], links, edgeLength);
		const startAt = (p: Placement) => (startAtOrigin ? p.from : p.at);
		cy.add(
			toAdd.map((e) => {
				const placement = placements.get(e.data.id as string);
				return placement ? { ...e, position: { ...startAt(placement) } } : e;
			}) as unknown as ElementDefinition[]
		);
	});
	return { placements, newcomers: newcomers.size, wasEmpty };
}
