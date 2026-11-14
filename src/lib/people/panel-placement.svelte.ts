import { fieldInView, panelPlacement, type PanelPlacement } from './panel-placement';

/**
 * Browser adapter: calls `apply` with where the list belongs now, and again whenever the page
 * scrolls, resizes or the on-screen keyboard moves the visual viewport. `null` means the field
 * left the screen. Returns the stop function.
 */
export function watchPlacement(
	field: HTMLElement,
	apply: (placement: PanelPlacement | null) => void
): () => void {
	const vv = window.visualViewport;
	const update = () => {
		const r = field.getBoundingClientRect();
		const view = vv
			? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height }
			: { top: 0, bottom: window.innerHeight };
		apply(fieldInView(r, view) ? panelPlacement({ field: r, view }) : null);
	};
	update();
	window.addEventListener('scroll', update, true);
	window.addEventListener('resize', update);
	vv?.addEventListener('resize', update);
	vv?.addEventListener('scroll', update);
	return () => {
		window.removeEventListener('scroll', update, true);
		window.removeEventListener('resize', update);
		vv?.removeEventListener('resize', update);
		vv?.removeEventListener('scroll', update);
	};
}
