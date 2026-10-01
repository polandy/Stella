import { dismissesFullscreenOnDrag } from '$lib/ui/fullscreen';
import { scrollingAncestor } from '$lib/ui/keep-place';

/** Full screen for the explorer's frame, whichever way this device supports it. */
export interface FrameFullscreen {
	/** Whether this device gets the app-level overlay instead of the browser's own. */
	readonly usesCss: boolean;
	/** Whether a full-screen button is offered at all. */
	readonly available: boolean;
	readonly on: boolean;
	toggle(): Promise<void>;
}

/*
 * Full screen has two implementations, because "leave full screen" means something
 * different by input method:
 * - Mouse (desktop): the browser's own Fullscreen API on the whole frame — canvas, toolbar
 *   and peek panel together — so nothing the map needs is left behind. The state follows
 *   the browser rather than the button, because Esc leaves it without asking us; that's
 *   fine, nobody presses Esc mid-drag.
 * - Touch on iPadOS/iOS Safari: panning the canvas is itself a drag, and Safari's own
 *   presentation layer reads a downward drag on *any* Fullscreen-API element as "swipe to
 *   dismiss" — the same gesture that closes a full-screen video — before any page script
 *   sees the touch, so there is nothing here that could intercept or undo it (confirmed
 *   against the real thing, not just in theory — a pointerup-triggered re-request never
 *   ran, because no pointer event fires for it). These devices (`dismissesFullscreenOnDrag`)
 *   get an app-level full screen instead: a fixed overlay over the whole viewport that is never
 *   handed to the browser, so there is no native gesture that can dismiss it — only the
 *   button. Android and other touch devices don't have this quirk, so they keep the native
 *   Fullscreen API like a mouse does.
 * Where neither is available (no Fullscreen API and not one of these devices) the button is
 * simply absent.
 *
 * Called while a component initialises, since it sets up effects; `getFrame` is read only
 * once the frame is in the document.
 */
export function frameFullscreen(getFrame: () => HTMLElement): FrameFullscreen {
	const usesCssFullscreen = typeof window !== 'undefined' && dismissesFullscreenOnDrag(navigator);
	let canFullscreen = $state(false);
	let fullscreen = $state(false);
	const syncFullscreen = () => (fullscreen = document.fullscreenElement === getFrame());

	async function toggleFullscreen() {
		if (usesCssFullscreen) {
			fullscreen = !fullscreen;
			return;
		}
		const frame = getFrame();
		try {
			if (document.fullscreenElement === frame) await document.exitFullscreen();
			else await frame.requestFullscreen();
		} catch (error) {
			console.error('Could not switch full screen', error);
		}
	}

	// An effect rather than onMount/onDestroy: it runs in the browser only (the server renders
	// this component too, and has no `document`), and a button present there but not here
	// would be a hydration mismatch.
	$effect(() => {
		canFullscreen = usesCssFullscreen || document.fullscreenEnabled;
		if (usesCssFullscreen) return;
		document.addEventListener('fullscreenchange', syncFullscreen);
		return () => document.removeEventListener('fullscreenchange', syncFullscreen);
	});

	// The app-level overlay covers the frame, but not whatever the reader scrolled down to
	// behind it (the rest of a person's page, in the embedded case). `document.body` is never
	// the thing that scrolls here — the shell's own root is already `h-screen overflow-hidden`
	// and the real scroller is an inner div further down — so lock whichever ancestor actually
	// has one, wherever this component happens to be mounted.
	$effect(() => {
		if (!usesCssFullscreen || !fullscreen) return;
		const scroller = scrollingAncestor<HTMLElement>(getFrame());
		if (!scroller) return;
		const previous = scroller.style.overflow;
		scroller.style.overflow = 'hidden';
		return () => {
			scroller.style.overflow = previous;
		};
	});

	return {
		usesCss: usesCssFullscreen,
		get available() {
			return canFullscreen;
		},
		get on() {
			return fullscreen;
		},
		toggle: toggleFullscreen
	};
}
