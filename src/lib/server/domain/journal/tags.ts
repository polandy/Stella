import type { KnownTag } from '../../../hashtags/picker';
import type { Viewer } from '../../access/visibility';

/*
 * Reading the tags on journal entries (docs/02 §2.20.2). A tag is seen by whoever can read an
 * entry carrying it, so its count is of those entries alone, and a tag found only on someone's
 * private entries is theirs to see, marked so. Written with the entries themselves
 * (`JournalRepository.replaceTags`); this port only reads.
 */

export interface EntryTagReads {
	/** The household's tags the viewer can see, for the `#` picker. */
	listVisibleTo(viewer: Viewer): Promise<KnownTag[]>;
	/** The tags on one person's entries the viewer can see, for their journal's filter. */
	listOnContactVisibleTo(viewer: Viewer, contactId: string): Promise<KnownTag[]>;
}
