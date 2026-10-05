import { describe, expect, it } from 'bun:test';
import {
	PHONE_MAP_AT_REST,
	mapLayers,
	phoneMapAfter,
	type PhoneMapEvent,
	type PhoneMapState,
	type PhoneMapStep,
	mapViewAfter,
	type PhoneMapView
} from './phone-map';

/*
 * The map on a person's page on a phone (docs/05 §5.5): a preview, the map enlarged inside the
 * card, or the map full screen. Leaving full screen goes back to where the reader came from.
 */

describe('mapViewAfter', () => {
	it('enlarges the preview in place and shrinks it back', () => {
		expect(mapViewAfter('preview', 'enlarge')).toBe('enlarged');
		expect(mapViewAfter('enlarged', 'shrink')).toBe('preview');
	});

	it('opens full screen straight from the preview, and leaving it returns to the preview', () => {
		expect(mapViewAfter('preview', 'openFullscreen')).toBe('fullscreen');
		expect(mapViewAfter('fullscreen', 'leftFullscreen')).toBe('preview');
	});

	it('keeps the enlarged map when its own full-screen button is used and then left', () => {
		// The enlarged map is the explorer, so full screen there is its toolbar's business.
		expect(mapViewAfter('enlarged', 'leftFullscreen')).toBe('enlarged');
	});

	it('ignores an event that does not belong to the view it arrives in', () => {
		const views: PhoneMapView[] = ['preview', 'enlarged', 'fullscreen'];
		for (const view of views) {
			if (view !== 'enlarged') expect(mapViewAfter(view, 'shrink')).toBe(view);
			if (view !== 'preview') expect(mapViewAfter(view, 'enlarge')).toBe(view);
			// openFullscreen is the preview's own link; the enlarged map and full screen itself
			// never wire it up, so it is a no-op there (docs/05 §5.5).
			if (view !== 'preview') expect(mapViewAfter(view, 'openFullscreen')).toBe(view);
		}
		expect(mapViewAfter('preview', 'leftFullscreen')).toBe('preview');
	});
});

/*
 * The way between preview and enlarged map is animated: the frame's height glides, and the
 * drawing and the live map cross-fade. Which layer shows at each moment follows two signals —
 * the height has arrived, the map has drawn itself — so neither a blank frame nor a jump.
 */
describe('phoneMapAfter and mapLayers', () => {
	const run = (...steps: PhoneMapStep[]) => steps.reduce(phoneMapAfter, PHONE_MAP_AT_REST);

	it('rests as the preview: short, the drawing and its controls showing, no live map', () => {
		expect(mapLayers(PHONE_MAP_AT_REST)).toEqual({
			tall: false,
			explorerMounted: false,
			explorerShown: false,
			previewShown: true,
			previewControlsShown: true
		});
	});

	it('grows with the drawing alone, and mounts the live map once the height has arrived', () => {
		// Building the canvas is the heaviest moment, and done mid-glide it costs the glide
		// its frames on a phone; at the end it lays out once, at its final size.
		const growing = run('enlarge');
		expect(mapLayers(growing)).toEqual({
			tall: true,
			explorerMounted: false,
			explorerShown: false,
			previewShown: true,
			previewControlsShown: false
		});
		expect(run('enlarge', 'drawn')).toEqual(growing);
		const grown = mapLayers(run('enlarge', 'settled'));
		expect(grown.explorerMounted).toBe(true);
		// Grown but not drawn would show a blank canvas: the drawing stays until it has.
		expect(grown.explorerShown).toBe(false);
		expect(grown.previewShown).toBe(true);
		const shown = mapLayers(run('enlarge', 'settled', 'drawn'));
		expect(shown.explorerShown).toBe(true);
		expect(shown.previewShown).toBe(false);
	});

	it('never mounts the live map for a glide reversed before it arrived', () => {
		const reversed = run('enlarge', 'shrink');
		expect(mapLayers(reversed).explorerMounted).toBe(false);
		expect(phoneMapAfter(reversed, 'settled')).toEqual(PHONE_MAP_AT_REST);
	});

	it('shrinks with the drawing back over the live map, which goes once the height is down', () => {
		const shrinking = run('enlarge', 'settled', 'drawn', 'shrink');
		expect(mapLayers(shrinking)).toEqual({
			tall: false,
			explorerMounted: true,
			explorerShown: false,
			previewShown: true,
			previewControlsShown: true
		});
		const rested = run('enlarge', 'settled', 'drawn', 'shrink', 'settled');
		expect(rested).toEqual(PHONE_MAP_AT_REST);
	});

	it('turns back mid-shrink without waiting for the map to draw again', () => {
		// The live map never left, so it is still drawn: only the height has to arrive.
		const back = run('enlarge', 'settled', 'drawn', 'shrink', 'enlarge');
		expect(mapLayers(back).explorerShown).toBe(false);
		expect(mapLayers(phoneMapAfter(back, 'settled')).explorerShown).toBe(true);
	});

	it('forgets a drawn map once it is gone, so the next enlarge waits for it again', () => {
		const again = run('enlarge', 'settled', 'drawn', 'shrink', 'settled', 'enlarge', 'settled');
		expect(mapLayers(again).explorerShown).toBe(false);
	});

	it('ignores a drawn signal from a map that is not mounted', () => {
		expect(run('drawn')).toEqual(PHONE_MAP_AT_REST);
	});

	it('opens and leaves full screen at rest, the in-card map left alone', () => {
		const full: PhoneMapState = run('openFullscreen');
		expect(full.view).toBe('fullscreen');
		expect(mapLayers(full).explorerMounted).toBe(false);
		expect(run('openFullscreen', 'leftFullscreen')).toEqual(PHONE_MAP_AT_REST);
	});

	it('passes every view change through mapViewAfter', () => {
		const events: PhoneMapEvent[] = ['enlarge', 'shrink', 'openFullscreen', 'leftFullscreen'];
		for (const event of events) {
			expect(phoneMapAfter(PHONE_MAP_AT_REST, event).view).toBe(mapViewAfter('preview', event));
		}
	});
});
