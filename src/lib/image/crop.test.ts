import { describe, expect, it } from 'bun:test';
import {
	cropFromRect,
	cropRect,
	imagePlacement,
	initialCrop,
	keyStep,
	maxZoom,
	panBy,
	pinch,
	zoomTo,
	type ImageSize
} from './crop';

/*
 * The square a person's photo is cut to (docs/02 §2.14). The cropper shows the picture behind a
 * square window; these rules decide which part of the picture the window holds, so what the
 * dialog shows and what the canvas cuts can never disagree.
 */

const landscape: ImageSize = { width: 4000, height: 3000 };
const portrait: ImageSize = { width: 1200, height: 1600 };

describe('a freshly picked photo', () => {
	it('starts on the centred square the uploader used to cut on its own', () => {
		expect(cropRect(landscape, initialCrop(landscape))).toEqual({ x: 500, y: 0, size: 3000 });
		expect(cropRect(portrait, initialCrop(portrait))).toEqual({ x: 0, y: 200, size: 1200 });
	});
});

describe('a photo framed before', () => {
	it('starts on the square chosen last time', () => {
		const remembered = { x: 1200, y: 600, size: 1500 };
		expect(cropRect(landscape, cropFromRect(landscape, remembered))).toEqual(remembered);
	});

	it('pulls a remembered square back inside a picture it no longer fits', () => {
		expect(cropRect(landscape, cropFromRect(landscape, { x: 3000, y: 2000, size: 5000 }))).toEqual({
			x: 1000,
			y: 0,
			size: 3000
		});
	});
});

describe('dragging the picture', () => {
	it('moves the picture with the finger, so the window shows what lay the other way', () => {
		// A 300px window over a 3000px square: one screen pixel is ten picture pixels.
		const dragged = panBy(landscape, initialCrop(landscape), { dx: 20, dy: 0 }, 300);
		expect(cropRect(landscape, dragged)).toEqual({ x: 300, y: 0, size: 3000 });
	});

	it('stops at the edge of the picture rather than showing empty space', () => {
		const farLeft = panBy(landscape, initialCrop(landscape), { dx: 5000, dy: 5000 }, 300);
		expect(cropRect(landscape, farLeft)).toEqual({ x: 0, y: 0, size: 3000 });

		const farRight = panBy(landscape, initialCrop(landscape), { dx: -5000, dy: -5000 }, 300);
		expect(cropRect(landscape, farRight)).toEqual({ x: 1000, y: 0, size: 3000 });
	});
});

describe('zooming in', () => {
	it('narrows the square around the middle of the window by default', () => {
		const zoomed = zoomTo(landscape, initialCrop(landscape), 2);
		expect(cropRect(landscape, zoomed)).toEqual({ x: 1250, y: 750, size: 1500 });
	});

	it('keeps the point under the fingers where it is', () => {
		// Pinching over the window's top-left corner keeps the picture's corner pinned there.
		const zoomed = zoomTo(landscape, initialCrop(landscape), 2, { x: 0, y: 0 });
		expect(cropRect(landscape, zoomed)).toEqual({ x: 500, y: 0, size: 1500 });
	});

	it('never zooms out past the whole short side, nor in past the limit', () => {
		expect(zoomTo(landscape, initialCrop(landscape), 0.2).zoom).toBe(1);
		expect(zoomTo(landscape, initialCrop(landscape), 99).zoom).toBe(maxZoom(landscape));
	});
});

describe('how far the picture lets you zoom', () => {
	// Concept circle-photos §5.3: the square may shrink to about 256 px of the original, so a
	// face in a class photo can fill the frame without being blown up past its detail.
	it('lets the square shrink to 256 px of the picture', () => {
		const classPhoto: ImageSize = { width: 4096, height: 2731 };
		const tightest = cropRect(classPhoto, zoomTo(classPhoto, initialCrop(classPhoto), 99));
		expect(tightest.size).toBeCloseTo(256);
	});

	it('follows the picture rather than a fixed factor', () => {
		expect(maxZoom(landscape)).toBeCloseTo(3000 / 256);
		expect(maxZoom(portrait)).toBeCloseTo(1200 / 256);
	});

	it('never goes below the whole short side, however small the picture', () => {
		expect(maxZoom({ width: 200, height: 150 })).toBe(1);
		expect(
			zoomTo({ width: 200, height: 150 }, initialCrop({ width: 200, height: 150 }), 4).zoom
		).toBe(1);
	});

	it('pulls the square back inside the picture when zooming out near an edge', () => {
		const inCorner = panBy(
			landscape,
			zoomTo(landscape, initialCrop(landscape), 4),
			{ dx: -9999, dy: -9999 },
			300
		);
		const zoomedOut = zoomTo(landscape, inCorner, 1);
		expect(cropRect(landscape, zoomedOut)).toEqual({ x: 1000, y: 0, size: 3000 });
	});
});

describe('drawing the picture behind the window', () => {
	it('scales and shifts the picture so exactly the cropped square fills the window', () => {
		const zoomed = zoomTo(landscape, initialCrop(landscape), 2);
		// Crop {x:1250, y:750, size:1500} in a 300px window: a fifth of the picture's size.
		expect(imagePlacement(landscape, zoomed, 300)).toEqual({
			left: -250,
			top: -150,
			width: 800,
			height: 600
		});
	});
});

describe('pinching with two fingers', () => {
	it('zooms by how far the fingers spread, around the point between them', () => {
		// Fingers around a point a quarter into the window spread to twice their distance, not moving
		// their midpoint: the picture doubles in size around that point.
		const pinched = pinch(
			landscape,
			initialCrop(landscape),
			{ a: { x: 50, y: 50 }, b: { x: 100, y: 100 } },
			{ a: { x: 25, y: 25 }, b: { x: 125, y: 125 } },
			300
		);
		expect(pinched.zoom).toBe(2);
		expect(cropRect(landscape, pinched)).toEqual({ x: 875, y: 375, size: 1500 });
	});

	it('moves the picture with the fingers when they travel together', () => {
		const pinched = pinch(
			landscape,
			initialCrop(landscape),
			{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 } },
			{ a: { x: 120, y: 100 }, b: { x: 220, y: 100 } },
			300
		);
		expect(cropRect(landscape, pinched)).toEqual({ x: 300, y: 0, size: 3000 });
	});

	it('ignores two fingers on the same spot rather than zooming by a division by zero', () => {
		const same = { x: 150, y: 150 };
		const pinched = pinch(
			landscape,
			initialCrop(landscape),
			{ a: same, b: same },
			{ a: same, b: same },
			300
		);
		expect(pinched).toEqual(initialCrop(landscape));
	});
});

describe('the keyboard', () => {
	it('moves the picture the way the arrow points, like dragging it', () => {
		const right = keyStep(landscape, initialCrop(landscape), 'ArrowRight', 300)!;
		const left = keyStep(landscape, initialCrop(landscape), 'ArrowLeft', 300)!;
		expect(cropRect(landscape, right).x).toBeLessThan(500);
		expect(cropRect(landscape, left).x).toBeGreaterThan(500);
	});

	it('zooms in with + (or = , the same key unshifted) and out with −', () => {
		const zoomedIn = keyStep(landscape, initialCrop(landscape), '+', 300)!;
		expect(zoomedIn.zoom).toBeGreaterThan(1);
		expect(keyStep(landscape, initialCrop(landscape), '=', 300)).toEqual(zoomedIn);
		expect(keyStep(landscape, zoomedIn, '-', 300)!.zoom).toBeCloseTo(1);
	});

	it('leaves every other key to the browser', () => {
		expect(keyStep(landscape, initialCrop(landscape), 'Tab', 300)).toBeNull();
		expect(keyStep(landscape, initialCrop(landscape), 'Enter', 300)).toBeNull();
	});
});
