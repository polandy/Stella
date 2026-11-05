import type { Core } from 'cytoscape';
import { nameGrowth } from '../layout/legibility';
import { grownNames, type CyStyle } from './stylesheet';

/**
 * Lays the grown lit names over the stylesheet as the zoom crosses a step (`nameGrowth`,
 * docs/05 §5.8). Stepped, so a pinch restyles the canvas a few times rather than every frame.
 */
export function growNamesOn(cy: Core) {
	let sheet: CyStyle[] | undefined;
	let growing = false;
	let growth = 1;
	const apply = () => {
		if (!sheet || cy.destroyed()) return;
		const grown = growing ? grownNames(growth) : [];
		cy.style([...sheet, ...grown] as unknown as Parameters<typeof cy.style>[0]);
	};
	cy.on('zoom', () => {
		const next = nameGrowth(cy.zoom());
		if (next === growth) return;
		growth = next;
		if (growing) apply();
	});
	return {
		restyle(next: CyStyle[], grow: boolean) {
			sheet = next;
			growing = grow;
			growth = nameGrowth(cy.zoom());
			apply();
		}
	};
}
