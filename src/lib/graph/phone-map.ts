/*
 * The map on a person's page on a phone (docs/05 §5.5): a small preview in the People card,
 * the map enlarged inside the card — the full explorer, the reader still on the page — or the
 * map full screen. Pure, so which view follows which tap is tested without a browser; the
 * component only mounts what the view says.
 */

export type PhoneMapView = 'preview' | 'enlarged' | 'fullscreen';

/** What the reader did: a button on the preview or the card, or leaving full screen. */
export type PhoneMapEvent = 'enlarge' | 'shrink' | 'openFullscreen' | 'leftFullscreen';

/**
 * The view after `event`. Full screen opened from the preview goes back to the preview when it
 * is left; full screen entered from the enlarged map (its own toolbar button) goes back to the
 * enlarged map, which is the same explorer and never stopped being shown. An event that does
 * not belong to the view it arrives in changes nothing.
 */
export function mapViewAfter(view: PhoneMapView, event: PhoneMapEvent): PhoneMapView {
	switch (event) {
		case 'enlarge':
			return view === 'preview' ? 'enlarged' : view;
		case 'shrink':
			return view === 'enlarged' ? 'preview' : view;
		case 'openFullscreen':
			return view === 'preview' ? 'fullscreen' : view;
		case 'leftFullscreen':
			return view === 'fullscreen' ? 'preview' : view;
	}
}
