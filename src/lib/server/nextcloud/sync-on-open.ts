import type { Viewer } from '../access/visibility';
import type { LinkSyncRequest, NextcloudLink } from '../domain/nextcloud/link';

/*
 * Opening Stella syncs the household's linked book when it is due (docs/02 §2.16.3). The page
 * never waits for it: what the sync brings shows on the next page, and nothing it runs into
 * reaches the member — a book out of reach is said on the import page, a failing sync only in
 * the log, by its message alone (the app password is in a header, never in a message).
 */

/** Starts the sync when due; the promise settles when it has, and never rejects. */
export function syncOnOpen(
	link: NextcloudLink,
	viewer: Viewer,
	request: LinkSyncRequest,
	log: (message: string) => void = (message) => console.warn(message)
): Promise<void> {
	return link.syncIfDue(viewer.householdId, request).then(
		(result) => {
			if (result && !result.ok) log('Nextcloud: the address book could not be reached');
		},
		(err: unknown) => {
			log(`Nextcloud: the sync failed: ${err instanceof Error ? err.message : 'unknown error'}`);
		}
	);
}
