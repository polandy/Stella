import type { Viewer } from '../../access/visibility';
import { isKnownByAFirstNameOnly } from '../../../people/namesakes';
import type { ContactSummary, DistinguishableContact } from './contacts';

/*
 * The household's people as the screens list them (docs/02 §2.2): the directory, the archive,
 * the first-name-only clean-up and Home's first-run card. A read model, apart from the
 * `ContactRepository` that writes a contact (docs/08 §8.3) — the reads change with the
 * screens, the writes with the record, and a test of a list should not have to fake an insert.
 *
 * Every read is scoped to the viewer by the adapter, through the access layer (docs/03 §3.7).
 */

/** The people lists, read through the access layer. */
export interface ContactDirectoryReads {
	/** The people the household browses — archived ones left out (docs/02 §2.2) — by name. */
	listVisibleTo(viewer: Viewer): Promise<ContactSummary[]>;
	/** The archived ones, which every other list leaves out (docs/02 §2.2). */
	listArchivedVisibleTo(viewer: Viewer): Promise<ContactSummary[]>;
	/** How many `listArchivedVisibleTo` would list. */
	countArchivedVisibleTo(viewer: Viewer): Promise<number>;
	/**
	 * Up to `limit` ids from the browsing scope, in no particular order — for a decision that
	 * only needs to know whether there is anybody (else), not who (Home's first-run card).
	 */
	listSomeBrowsableIdsVisibleTo(viewer: Viewer, limit: number): Promise<string[]>;
	/** What tells each browsable person apart (docs/02 §2.2.3), without the rest of the record. */
	listDistinguishableVisibleTo(viewer: Viewer): Promise<DistinguishableContact[]>;
}

export interface ContactDirectoryDeps {
	directory: ContactDirectoryReads;
}

/** List the contacts visible to the viewer. */
export async function listContacts(
	deps: ContactDirectoryDeps,
	viewer: Viewer
): Promise<ContactSummary[]> {
	return deps.directory.listVisibleTo(viewer);
}

/**
 * How many browsable people are known by a first name alone (docs/02 §2.2.3) — the number on
 * the Settings card — counted by the clean-up list's own rule over just the columns it reads.
 */
export async function countKnownByAFirstNameOnly(
	deps: ContactDirectoryDeps,
	viewer: Viewer
): Promise<number> {
	return (await deps.directory.listDistinguishableVisibleTo(viewer)).filter(isKnownByAFirstNameOnly)
		.length;
}

/**
 * Enough of the household's browsable people to tell whether it holds anybody besides the
 * viewer's own record: two ids, so one more than the self record can ever be. Home's first-run
 * card (docs/02 §2.22.3) asks this on every visit, so it must not read the whole household.
 */
export async function listPeopleEnoughForFirstRun(
	deps: ContactDirectoryDeps,
	viewer: Viewer
): Promise<string[]> {
	return deps.directory.listSomeBrowsableIdsVisibleTo(viewer, 2);
}

/** How many archived people the viewer may see — what the archive chip says. */
export async function countArchivedContacts(
	deps: ContactDirectoryDeps,
	viewer: Viewer
): Promise<number> {
	return deps.directory.countArchivedVisibleTo(viewer);
}

/** List the archived contacts — the only read that shows them as a list. */
export async function listArchivedContacts(
	deps: ContactDirectoryDeps,
	viewer: Viewer
): Promise<ContactSummary[]> {
	return deps.directory.listArchivedVisibleTo(viewer);
}
