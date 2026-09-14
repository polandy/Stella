import { expect, type Page } from '@playwright/test';

/*
 * Reading and driving the relationship canvas from a spec (docs/05 §5.8).
 *
 * A canvas has no DOM to address, so these read the renderer's own state through the instance
 * Cytoscape registers on its container: which nodes it holds, which it has filtered out, and
 * where it has drawn them. That is the renderer answering — not the model being re-read — and
 * it makes clicking a named person deterministic instead of a guess at a coordinate.
 *
 * Shared by the explorer route's spec and the map embedded in a person's page, which must
 * agree about what a node is — one copy, so the two cannot come to read the canvas differently.
 */

/** The slice of the Cytoscape instance these helpers read from the page. */
export interface CyForTests {
	$id(id: string): {
		empty(): boolean;
		hasClass(name: string): boolean;
		renderedPosition(): { x: number; y: number };
	};
	$(selector: string): { map(fn: (edge: { data(key: string): string }) => string): string[] };
}

export type NodeState = 'absent' | 'filtered-out' | 'drawn';

export interface DrawnNode {
	state: NodeState;
	/** Page coordinates of the node's centre, or null when it is not drawn. */
	point: { x: number; y: number } | null;
}

/** What the renderer is doing with one node right now. */
export async function drawnNode(page: Page, id: string): Promise<DrawnNode> {
	return page.evaluate((nodeId) => {
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el ? (el as unknown as { _cyreg: { cy: CyForTests } })._cyreg.cy : null;
		if (!cy || !el) return { state: 'absent' as const, point: null };
		const node = cy.$id(nodeId);
		if (node.empty()) return { state: 'absent' as const, point: null };
		const box = el.getBoundingClientRect();
		const p = node.renderedPosition();
		return node.hasClass('filtered-out')
			? { state: 'filtered-out' as const, point: null }
			: { state: 'drawn' as const, point: { x: box.x + p.x, y: box.y + p.y } };
	}, id);
}

export const stateOf = async (page: Page, id: string) => (await drawnNode(page, id)).state;

/** Clicks a node where the renderer has actually drawn it. */
export async function clickNode(page: Page, id: string): Promise<void> {
	const { point } = await drawnNode(page, id);
	if (!point) throw new Error(`the explorer is not drawing ${id}, so it cannot be clicked`);
	await page.mouse.click(point.x, point.y);
}

/** The names on the lines the renderer is currently emphasising. */
export async function highlightedLabels(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el ? (el as unknown as { _cyreg: { cy: CyForTests } })._cyreg.cy : null;
		return cy ? cy.$('edge.highlight').map((edge) => edge.data('label')) : [];
	});
}

/** Waits for the renderer's own signal that its layout has stopped moving the nodes. */
export async function settled(page: Page): Promise<void> {
	await expect(page.locator('[data-layout]')).toHaveAttribute('data-layout', 'settled');
}

/**
 * Hop distance from `centerId` for every node the renderer currently holds, walked over the
 * edges it has drawn. A spec picks "somebody two hops out" by what is on the screen rather
 * than by naming a person the seed might one day relate differently.
 */
export async function ringsOnCanvas(page: Page, centerId: string): Promise<Map<string, number>> {
	const pairs = await page.evaluate((center) => {
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el
			? (el as unknown as {
					_cyreg: {
						cy: { edges(): { map(fn: (e: { data(k: string): string }) => string[]): string[][] } };
					};
				})._cyreg.cy
			: null;
		if (!cy) return [] as [string, number][];

		const neighbours = new Map<string, string[]>();
		const link = (from: string, to: string) => {
			const list = neighbours.get(from);
			if (list) list.push(to);
			else neighbours.set(from, [to]);
		};
		for (const [source, target] of cy.edges().map((e) => [e.data('source'), e.data('target')])) {
			link(source, target);
			link(target, source);
		}

		const rings = new Map<string, number>([[center, 0]]);
		let frontier = [center];
		for (let ring = 1; frontier.length > 0; ring++) {
			const next: string[] = [];
			for (const id of frontier) {
				for (const neighbour of neighbours.get(id) ?? []) {
					if (rings.has(neighbour)) continue;
					rings.set(neighbour, ring);
					next.push(neighbour);
				}
			}
			frontier = next;
		}
		return [...rings] as [string, number][];
	}, centerId);
	return new Map(pairs);
}

/**
 * The first of these nodes the renderer draws somewhere the canvas itself answers for — the
 * toolbar and the peek panel float over the drawing, and a node underneath one of them cannot
 * be clicked at all. Which nodes those are depends on the layout, so a spec picks a target it
 * can actually reach rather than naming one and hoping.
 */
export async function firstClickableNode(page: Page, ids: string[]): Promise<string | null> {
	for (const id of ids) {
		const { point } = await drawnNode(page, id);
		if (!point) continue;
		const onTop = await page.evaluate(
			(p) => document.elementFromPoint(p.x, p.y)?.tagName.toLowerCase() ?? 'nothing',
			point
		);
		if (onTop === 'canvas') return id;
	}
	return null;
}
