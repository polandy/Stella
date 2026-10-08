import type { Viewer } from '../../../access/visibility';
import type { CircleKind } from '../../circles/circles';
import type { CircleDirectoryReads } from '../../circles/directory';
import { search, type SearchDeps } from '../../search/search';

/*
 * The API's lookups (docs/02 §2.16.1): how a script finds the ids it then names as
 * `existingId`. Both go through the household's own reads, so a script finds exactly what its
 * member would find in the app — no more.
 */

/** A person as the API lists them (docs/02 §2.16.1). */
export interface PersonMatch {
	id: string;
	displayName: string;
	description: string | null;
}

/** A circle as the API lists it. */
export interface CircleMatch {
	id: string;
	name: string;
	kind: CircleKind;
	startDate: string | null;
	endDate: string | null;
	memberCount: number;
}

/** The people the household search finds for `query`, in its order. */
export async function findPeople(
	deps: SearchDeps,
	viewer: Viewer,
	query: string
): Promise<PersonMatch[]> {
	// Picked field by field, so what the app's result list grows never widens the API's answer.
	return (await search(deps, viewer, query)).contacts.map(({ id, displayName, description }) => ({
		id,
		displayName,
		description
	}));
}

/** A name folded for matching: no case, no accents. */
const folded = (value: string) =>
	value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();

/** The circles whose name contains `query`; all of them for an empty one. */
export async function findCircles(
	deps: { directory: Pick<CircleDirectoryReads, 'listVisibleTo'> },
	viewer: Viewer,
	query: string
): Promise<CircleMatch[]> {
	const wanted = folded(query);
	return (await deps.directory.listVisibleTo(viewer))
		.filter((c) => folded(c.name).includes(wanted))
		.map(({ id, name, kind, startDate, endDate, memberCount }) => ({
			id,
			name,
			kind,
			startDate,
			endDate,
			memberCount
		}));
}
