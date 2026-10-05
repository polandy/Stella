import { describe, expect, it } from 'bun:test';
import { mapViewAfter, type PhoneMapView } from './phone-map';

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
