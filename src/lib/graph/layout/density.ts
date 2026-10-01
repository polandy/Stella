/*
 * How close together the explorer sets people (docs/05 §5.8). The reader picks one of three
 * densities in the Filter menu, and this browser keeps it; this module only says what each one
 * means, so the canvas and the tests read the same numbers.
 */

/** The densities the reader can choose between, tightest first. */
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type Density = (typeof DENSITIES)[number];

/** Where a map starts until the reader chooses: names side by side never touch. */
export const DEFAULT_DENSITY: Density = 'comfortable';

/** What a density sets on the canvas, in model units. */
export interface Spacing {
	/**
	 * The length the free arrangement aims every line at, and how far apart an expand sets its
	 * newcomers. Always wider than a name, so two people side by side never share a label's room.
	 */
	edgeLength: number;
	/** How hard the free arrangement pushes people apart, which grows with the edge length. */
	repulsion: number;
}

const SPACINGS: Record<Density, Spacing> = {
	// Just past a name's width: the most people on one screen without names running together.
	compact: { edgeLength: 100, repulsion: 7000 },
	comfortable: { edgeLength: 116, repulsion: 10000 },
	spacious: { edgeLength: 150, repulsion: 18000 }
};

export function spacingFor(density: Density): Spacing {
	return SPACINGS[density];
}

/** A stored density read back; anything it does not know (or nothing) is the default. */
export function parseDensity(stored: string | null): Density {
	return DENSITIES.find((density) => density === stored) ?? DEFAULT_DENSITY;
}
