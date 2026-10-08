import type { Viewer } from '../../access/visibility';
import type { ContactName } from './contacts';

/*
 * Id and name of the people a page is about to name (docs/02 §2.2): the @-mentions in a story
 * page, a circle's members, the people Home's stream lines mention. A read model, apart from
 * the `ContactRepository` that writes a contact (docs/08 §8.3).
 *
 * Two scopes, on purpose. An @-mention already written resolves through the *visibility* scope:
 * archiving takes someone out of the lists, not out of the sentences that name them, so it must
 * keep reading their name rather than "@unknown". What the household is offered to act on uses
 * the *browsing* scope, archived people left out (docs/03 §3.3, `contact`).
 */

/** Names of contacts, read through the access layer. */
export interface ContactNameReads {
	/** Those of `ids` the viewer may see — archived ones included. */
	listNamesAmongVisibleTo(viewer: Viewer, ids: readonly string[]): Promise<ContactName[]>;
	/** Those of `ids` the viewer may see and the household still browses — archived ones left out. */
	listBrowsableNamesAmong(viewer: Viewer, ids: readonly string[]): Promise<ContactName[]>;
}

export interface ContactNameDeps {
	contactNames: ContactNameReads;
}

/** Resolve the @-mentions of just the people a page names, archived ones included. */
export async function listContactNamesAmong(
	deps: ContactNameDeps,
	viewer: Viewer,
	ids: readonly string[]
): Promise<ContactName[]> {
	const unique = [...new Set(ids)];
	return unique.length === 0 ? [] : deps.contactNames.listNamesAmongVisibleTo(viewer, unique);
}

/** Those of `ids` the viewer may see and the household still browses, with their names. */
export async function listBrowsableNamesAmong(
	deps: ContactNameDeps,
	viewer: Viewer,
	ids: readonly string[]
): Promise<ContactName[]> {
	const unique = [...new Set(ids)];
	return unique.length === 0 ? [] : deps.contactNames.listBrowsableNamesAmong(viewer, unique);
}
