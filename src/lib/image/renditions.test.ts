import { describe, expect, it } from 'bun:test';
import { groupPhotoRenditions, photoRenditions } from './renditions';

/*
 * The sizes a picture is stored at (docs/02 §2.14, docs/concepts/circle-photos.md §5.3). A
 * person's photo is kept at 1600 px; a group photo at up to 4096 px so a face can be cut from
 * it, with a 1600 px view beside it for the grid and the lightbox. Nothing is ever enlarged.
 */

describe("a person's photo", () => {
	it('is fitted within 1600 px, with a 480 px thumbnail, and has no separate view', () => {
		expect(photoRenditions({ width: 4000, height: 3000 })).toEqual({
			full: { width: 1600, height: 1200 },
			view: null,
			thumb: { width: 480, height: 360 }
		});
	});
});

describe('a group photo', () => {
	it('is kept up to 4096 px, with a 1600 px view and the thumbnail', () => {
		expect(groupPhotoRenditions({ width: 6000, height: 4000 })).toEqual({
			full: { width: 4096, height: 2731 },
			view: { width: 1600, height: 1067 },
			thumb: { width: 480, height: 320 }
		});
	});

	it('needs no view when the picture is no larger than one', () => {
		expect(groupPhotoRenditions({ width: 1200, height: 1600 })).toEqual({
			full: { width: 1200, height: 1600 },
			view: null,
			thumb: { width: 360, height: 480 }
		});
	});

	it('is never enlarged', () => {
		expect(groupPhotoRenditions({ width: 2400, height: 1800 }).full).toEqual({ width: 2400, height: 1800 });
	});
});
