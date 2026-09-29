import { describe, expect, it } from 'bun:test';
import {
	MAX_ZOOM,
	cropRect,
	imagePlacement,
	initialCrop,
	panBy,
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
		expect(zoomTo(landscape, initialCrop(landscape), 99).zoom).toBe(MAX_ZOOM);
	});

	it('pulls the square back inside the picture when zooming out near an edge', () => {
		const inCorner = panBy(landscape, zoomTo(landscape, initialCrop(landscape), 4), { dx: -9999, dy: -9999 }, 300);
		const zoomedOut = zoomTo(landscape, inCorner, 1);
		expect(cropRect(landscape, zoomedOut)).toEqual({ x: 1000, y: 0, size: 3000 });
	});
});

describe('drawing the picture behind the window', () => {
	it('scales and shifts the picture so exactly the cropped square fills the window', () => {
		const zoomed = zoomTo(landscape, initialCrop(landscape), 2);
		// Crop {x:1250, y:750, size:1500} in a 300px window: a fifth of the picture's size.
		expect(imagePlacement(landscape, zoomed, 300)).toEqual({ left: -250, top: -150, width: 800, height: 600 });
	});
});
