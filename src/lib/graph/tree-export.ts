// Imported relatively, like `edge-words.ts`, so the module carries no SvelteKit alias.
import type { Translate } from '../i18n/translate';
import type { Size } from './layout/geometry';
import type { GraphModel, GraphNode } from './model/types';

/*
 * The family tree as a picture or a printed page (docs/02 §2.7): what goes on it, and how big it
 * comes out. Pure; drawing it is `cytoscape/tree-image.ts`, and the dialog only asks.
 */

export type ExportFormat = 'png' | 'print';
/** Always landscape: a family tree is wider than it is tall. */
export type Paper = 'a4' | 'a3';

/** What the reader chose in the dialog. */
export interface ExportChoices {
	title: string;
	format: ExportFormat;
	paper: Paper;
	/** Years of birth and death under each name. */
	dates: boolean;
	/** Private people and circles the reader may see; off, since a print leaves the household. */
	withPrivate: boolean;
}

/**
 * The map as it leaves the household: a private person or circle only when the reader asks,
 * and never a line to one that stays behind.
 */
export function exportedModel(model: GraphModel, withPrivate: boolean): GraphModel {
	if (withPrivate) return model;
	const nodes = model.nodes.filter((n) => !n.private);
	const kept = new Set(nodes.map((n) => n.id));
	return { nodes, edges: model.edges.filter((e) => kept.has(e.source) && kept.has(e.target)) };
}

/** How many on the map the private switch would bring onto the export. */
export function privateCount(model: GraphModel): number {
	return model.nodes.filter((n) => n.private).length;
}

/** The years a person lived, as far as they are on record. */
export type LifeYears =
	| { kind: 'born'; year: number }
	| { kind: 'died'; year: number }
	| { kind: 'span'; born: number; died: number | null };

export function lifeYearsOf(node: GraphNode): LifeYears | null {
	if (node.kind !== 'person') return null;
	const { born, died, deceased } = node;
	if (born !== undefined && (died !== undefined || deceased)) {
		return { kind: 'span', born, died: died ?? null };
	}
	if (born !== undefined) return { kind: 'born', year: born };
	if (died !== undefined) return { kind: 'died', year: died };
	return null;
}

/** The years as the line under the name reads them ("1938 – 2019", "b. 1941"). */
export function lifeYearsWords(t: Translate, years: LifeYears): string {
	switch (years.kind) {
		case 'born':
			return t('graph.export.born', { year: years.year });
		case 'died':
			return t('graph.export.died', { year: years.year });
		case 'span':
			return years.died === null
				? t('graph.export.livedUntilUnknown', { born: years.born })
				: t('graph.export.lived', { born: years.born, died: years.died });
	}
}

/** Landscape paper, in millimetres. */
export const PAPER_MM: Record<Paper, Size> = {
	a4: { width: 297, height: 210 },
	a3: { width: 420, height: 297 }
};
/** The page's margin on every side; most home printers cannot print closer to the edge. */
export const PAGE_MARGIN_MM = 10;
/** A CSS pixel, which is what the canvas measures the tree in, at its printed size. */
const MM_PER_PX = 25.4 / 96;
const MM_PER_PT = 25.4 / 72;
/** The size a name is drawn at on the canvas (`stylesheet.ts`). */
const NAME_PX = 11;
/** A small tree is enlarged to fill the page, but not so far that it looks like a poster. */
const MAX_ENLARGEMENT = 2;
/** Below this, names on A4 are hard to read, and the dialog points to A3. */
export const NAME_PT_FOR_A3 = 7;

export interface PrintedSize {
	widthMm: number;
	heightMm: number;
	/** How large a name comes out on the paper. */
	namePt: number;
}

/**
 * How large the tree comes out on one page: always one page, scaled to fit within the margins
 * (owner, 2026-11-02 — a tree taped together from several sheets is not one anybody hangs up).
 */
export function printedSize(tree: Size, paper: Paper): PrintedSize {
	const page = PAPER_MM[paper];
	const mmPerPx = Math.min(
		(page.width - 2 * PAGE_MARGIN_MM) / tree.width,
		(page.height - 2 * PAGE_MARGIN_MM) / tree.height,
		MM_PER_PX * MAX_ENLARGEMENT
	);
	return {
		widthMm: tree.width * mmPerPx,
		heightMm: tree.height * mmPerPx,
		namePt: (NAME_PX * mmPerPx) / MM_PER_PT
	};
}

/** A picture shared on a phone: twice its size on screen, sharp on a dense display. */
const PNG_SCALE = 2;
const PRINT_DPI = 300;
/**
 * The most pixels a canvas may hold: iOS Safari refuses a larger one and draws nothing, which
 * would export an empty picture.
 */
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_SCALE = 8;

/** How many pixels per canvas pixel the picture is drawn at. */
export function renderScale(tree: Size, format: ExportFormat, paper: Paper): number {
	const wanted =
		format === 'png'
			? PNG_SCALE
			: ((printedSize(tree, paper).widthMm / 25.4) * PRINT_DPI) / tree.width;
	const fits = Math.sqrt(MAX_CANVAS_PIXELS / (tree.width * tree.height));
	return Math.min(wanted, fits, MAX_SCALE);
}

/** The picture's file name, from its title. */
export function fileNameFor(title: string): string {
	const slug = title
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'family-tree'}.png`;
}
