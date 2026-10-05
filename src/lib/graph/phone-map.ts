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

/*
 * Between preview and enlarged map the card animates (docs/05 §5.5): the frame's height glides
 * and the drawing and the live map cross-fade over each other. Two signals say when the live
 * map may show — its frame has reached its height, and it has drawn itself. The live map is
 * mounted only once the frame is tall, so the canvas is built at its final size and never
 * resized while the frame moves, and it stays under the drawing until a shrink has finished, so
 * the card never shows a blank frame.
 */

/** The view, and how far the way into it has come. */
export interface PhoneMapState {
	view: PhoneMapView;
	/** The frame's height has arrived where the view puts it. */
	settled: boolean;
	/** The live map in the card has drawn itself (and is still mounted). */
	drawn: boolean;
}

/** A reader's event, or one of the two signals: the height arrived, the live map drew. */
export type PhoneMapStep = PhoneMapEvent | 'settled' | 'drawn';

/** The page as it loads: the preview, still. */
export const PHONE_MAP_AT_REST: PhoneMapState = { view: 'preview', settled: true, drawn: false };

/** Which layers of the card's map frame show. */
export interface MapLayers {
	/** The frame stands at the enlarged height (and glides there). */
	tall: boolean;
	/** The live map is in the frame — drawing underneath, shown, or about to go. */
	explorerMounted: boolean;
	/** The live map is faded in and takes taps. */
	explorerShown: boolean;
	/** The server-drawn picture is faded in over the frame. */
	previewShown: boolean;
	/** The preview's own icons (enlarge, full screen) are faded in and take taps. */
	previewControlsShown: boolean;
}

export function phoneMapAfter(state: PhoneMapState, step: PhoneMapStep): PhoneMapState {
	if (step === 'settled') {
		// A shrink that has arrived takes the live map away, and with it its drawing.
		return { ...state, settled: true, drawn: state.view === 'enlarged' && state.drawn };
	}
	if (step === 'drawn') {
		return mapLayers(state).explorerMounted ? { ...state, drawn: true } : state;
	}
	const view = mapViewAfter(state.view, step);
	if (view === state.view) return state;
	// Full screen mounts a map of its own; the card's frame is at rest under it.
	if (view === 'fullscreen' || state.view === 'fullscreen') return { ...PHONE_MAP_AT_REST, view };
	return { view, settled: false, drawn: state.drawn };
}

export function mapLayers(state: PhoneMapState): MapLayers {
	const enlarged = state.view === 'enlarged';
	const explorerShown = enlarged && state.settled && state.drawn;
	return {
		tall: enlarged,
		// Mounted once the frame is tall — building the canvas mid-glide costs the glide its
		// frames on a phone — and kept, drawn, under the picture until a shrink has arrived.
		explorerMounted: (enlarged && (state.settled || state.drawn)) || (!state.settled && state.drawn),
		explorerShown,
		previewShown: !explorerShown,
		previewControlsShown: state.view === 'preview'
	};
}
