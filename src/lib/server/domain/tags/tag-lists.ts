import type { Viewer } from '../../access/visibility';
import type { ContactSummary } from '../contacts/contacts';
import type { Tag } from './tags';

/*
 * The tags as the screens list them (docs/02 §2.8): the household's chip row, a person's tags,
 * and the people a chip filters to. A read model, apart from the `TagRepository` that writes a
 * tag and its assignments (docs/08 §8.3).
 *
 * A person's tags and the people with a tag are scoped to the viewer by the adapter, through the
 * access layer (docs/03 §3.7): a tag on a private contact, and that contact, stay private.
 */

/** The tag lists. */
export interface TagListReads {
	/** Every tag of the household, by name — tags are household-global. */
	listByHousehold(householdId: string): Promise<Tag[]>;
	/** The tags one person carries, by name. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<Tag[]>;
	/** The people who carry one tag, by name, as the directory lists them. */
	listContactsByTagVisibleTo(viewer: Viewer, tagId: string): Promise<ContactSummary[]>;
}

export interface TagListDeps {
	tagLists: TagListReads;
}

export async function listTags(deps: TagListDeps, householdId: string): Promise<Tag[]> {
	return deps.tagLists.listByHousehold(householdId);
}

export async function listTagsForContact(
	deps: TagListDeps,
	viewer: Viewer,
	contactId: string
): Promise<Tag[]> {
	return deps.tagLists.listForContactVisibleTo(viewer, contactId);
}

export async function listContactsByTag(
	deps: TagListDeps,
	viewer: Viewer,
	tagId: string
): Promise<ContactSummary[]> {
	return deps.tagLists.listContactsByTagVisibleTo(viewer, tagId);
}
