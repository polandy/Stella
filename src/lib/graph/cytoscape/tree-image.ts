import type { Core, CytoscapeOptions, ElementDefinition } from 'cytoscape';
import { familyTreeLayout } from '../layout/family-tree';
import { DEFAULT_NODE_SIZE, type Size } from '../layout/geometry';
import type { ExportScene } from '../tree-export-scene';
import { sizeOf } from './canvas-nodes';
import { buildStylesheet, type CyStyle } from './stylesheet';
import { bendLines, writeCaption } from './tree-canvas';
import { lightPaletteFromDom, type Palette } from './theme';

/*
 * Draws the family tree for export (docs/02 §2.7) on a core of its own, out of sight, so the
 * reader's map neither moves nor flickers: laid out afresh from the scene, in the light theme,
 * with every photo loaded before the picture is taken. The title and the date it was made stand
 * above the tree, over a rule. Like the rest of `cytoscape/`, it holds no domain rules.
 */

export interface TreeImageRequest {
	scene: ExportScene;
	/** Whether the lines are named, as on screen. */
	edgeLabels: boolean;
	/** The shelf's caption, when the tree has one. */
	outsideFamily: string;
	title: string;
	/** "Made 2 November 2026", already in the reader's language. */
	madeOn: string;
	/**
	 * Whether the title and date are written above the tree, or their room left blank: the
	 * dialog's preview lays them over it as text, so typing a title does not draw the tree again.
	 */
	writeHeader: boolean;
	/** How many pixels per canvas pixel, given the picture's whole size in canvas pixels. */
	scaleFor: (size: Size) => number;
}

export interface TreeImage {
	blob: Blob;
	/** The picture's size in canvas pixels, the header's room included: what a print is scaled from. */
	size: Size;
}

/** The header's measures in canvas pixels, which the dialog's preview lays its text out by. */
export const HEADER_LAYOUT = {
	/** Room around the tree and the header. */
	pad: 24,
	titlePx: 20,
	madeOnPx: 11,
	/** From the title's baseline down to the rule under it. */
	ruleBelow: 6
} as const;
const { pad: PAD, titlePx: TITLE_PX, madeOnPx: MADE_ON_PX, ruleBelow: RULE_BELOW } = HEADER_LAYOUT;
/** Between the title and the date beside it, and from the rule under them to the tree. */
const GAP = 16;
/** From the top of the picture to the tree: the title, the rule beneath it, and a gap. */
const HEADER = PAD + TITLE_PX + RULE_BELOW + 1 + GAP;

export async function drawTreeImage(request: TreeImageRequest): Promise<TreeImage> {
	const cytoscape = (await import('cytoscape')).default;
	// White paper, as the card is in the light theme, rather than the page's tinted ground.
	const light = lightPaletteFromDom();
	const palette = { ...light, bg: light.card };
	const serif = getComputedStyle(document.documentElement).getPropertyValue('--font-serif');
	const container = document.createElement('div');
	container.setAttribute('aria-hidden', 'true');
	// Out of sight, but laid out: a renderer without a size measures no names.
	container.style.cssText =
		'position:fixed;left:-10000px;top:0;width:800px;height:600px;pointer-events:none';
	document.body.append(container);
	const cy: Core = cytoscape({
		container,
		style: stylesheetFor(palette, request) as unknown as CytoscapeOptions['style'],
		boxSelectionEnabled: false,
		autoungrabify: true
	});
	try {
		cy.batch(() => cy.add(request.scene.elements as unknown as ElementDefinition[]));
		arrange(cy, request);
		await photosLoaded(cy);

		const tree = cy.elements().boundingBox({ includeLabels: true });
		const titleFont = `600 ${TITLE_PX}px ${serif || palette.fontSans}`;
		const madeOnFont = `${MADE_ON_PX}px ${palette.fontSans}`;
		const header =
			textWidth(request.title, titleFont) + GAP + textWidth(request.madeOn, madeOnFont);
		const size = { width: Math.max(tree.w, header) + 2 * PAD, height: HEADER + tree.h + PAD };
		const scale = request.scaleFor(size);
		const png = await cy.png({ output: 'blob-promise', full: true, scale, bg: palette.bg });

		const canvas = document.createElement('canvas');
		canvas.width = Math.round(size.width * scale);
		canvas.height = Math.round(size.height * scale);
		const ink = canvas.getContext('2d');
		if (!ink) throw new Error('The browser gave no canvas to draw the tree on.');
		ink.scale(scale, scale);
		ink.fillStyle = palette.bg;
		ink.fillRect(0, 0, size.width, size.height);
		if (request.writeHeader) {
			const baseline = PAD + TITLE_PX;
			ink.fillStyle = palette.fg;
			ink.font = titleFont;
			ink.fillText(request.title, PAD, baseline);
			ink.fillStyle = palette.fgMuted;
			ink.font = madeOnFont;
			ink.textAlign = 'right';
			ink.fillText(request.madeOn, size.width - PAD, baseline);
			ink.fillStyle = palette.border;
			ink.fillRect(PAD, baseline + RULE_BELOW, size.width - 2 * PAD, 1);
		}
		const picture = await createImageBitmap(png);
		ink.drawImage(picture, (size.width - tree.w) / 2, HEADER, tree.w, tree.h);
		picture.close();
		return { blob: await blobOf(canvas), size };
	} finally {
		cy.destroy();
		container.remove();
	}
}

/** The screen's tree stylesheet, light, every name drawn however small the preview. */
function stylesheetFor(palette: Palette, request: TreeImageRequest): CyStyle[] {
	return [
		...buildStylesheet(palette, {
			edgeLabels: request.edgeLabels,
			reducedMotion: true,
			familyTree: request.scene.underNames
		}),
		{ selector: 'node, edge', style: { 'min-zoomed-font-size': 0 } }
	];
}

/** Lays the tree out as the explorer does, and sets everybody straight down where they go. */
function arrange(cy: Core, request: TreeImageRequest): void {
	const arrangement = familyTreeLayout(request.scene.model, (id) => {
		const node = cy.$id(id);
		return node.empty() ? DEFAULT_NODE_SIZE : sizeOf(node);
	});
	const captioned = writeCaption(cy, arrangement.outsideFamily, request.outsideFamily);
	const places = new Map([...arrangement.positions, ...captioned]);
	cy.batch(() => {
		cy.nodes().forEach((node) => {
			const at = places.get(node.id());
			if (at) node.position({ ...at });
		});
	});
	bendLines(cy, arrangement, (node) => node.position());
}

/** The renderer's own image cache, which the picture is drawn from (Cytoscape 3.x). */
interface ImageCacheRenderer {
	getCachedImage(url: string, crossOrigin: string, onLoad: () => void): HTMLImageElement;
}

/**
 * Every photo in the renderer's cache, loaded or failed. Cytoscape draws a photo only once it
 * has arrived and leaves the disc plain until then — a picture taken straight away would have
 * no faces in it.
 */
async function photosLoaded(cy: Core): Promise<void> {
	const renderer = (cy as unknown as { renderer(): ImageCacheRenderer }).renderer();
	const urls = new Set(cy.nodes('[photo]').map((node) => String(node.data('photo'))));
	await Promise.all(
		[...urls].map(
			(url) =>
				new Promise<void>((settled) => {
					const image = renderer.getCachedImage(url, 'use-credentials', () => {});
					if (image.complete) return settled();
					image.addEventListener('load', () => settled(), { once: true });
					image.addEventListener('error', () => settled(), { once: true });
				})
		)
	);
}

function textWidth(text: string, font: string): number {
	const ink = document.createElement('canvas').getContext('2d');
	if (!ink) return 0;
	ink.font = font;
	return ink.measureText(text).width;
}

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((done, failed) =>
		canvas.toBlob((blob) =>
			blob ? done(blob) : failed(new Error('The browser could not make the picture.'))
		)
	);
}
