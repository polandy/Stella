import type { Viewer } from '../../access/visibility';
import type { CircleWithCount } from './circles';

/*
 * The household's circles as the overview lists them (docs/02 §2.4.2), each with how many, and
 * which, of its members the viewer may see — the cards, and the API's circle lookup. A read
 * model, apart from the `CircleRepository` that writes a circle (docs/08 §8.3).
 *
 * Every read is scoped to the viewer by the adapter, through the access layer (docs/03 §3.7).
 */

/** The circles overview, read through the access layer. */
export interface CircleDirectoryReads {
	/** The circles the viewer may see, by name, with their visible members counted. */
	listVisibleTo(viewer: Viewer): Promise<CircleWithCount[]>;
}

export interface CircleDirectoryDeps {
	directory: CircleDirectoryReads;
}

export async function listCircles(
	deps: CircleDirectoryDeps,
	viewer: Viewer
): Promise<CircleWithCount[]> {
	return deps.directory.listVisibleTo(viewer);
}
