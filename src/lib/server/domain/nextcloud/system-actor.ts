import type { Viewer } from '../../access/visibility';

/**
 * Who the activity log names for a change that came from the linked book (docs/02 §2.16.3): a
 * user of the household that no one signs in as and that is never one of the members. Made the
 * first time it is asked for.
 */
export interface SystemActors {
	nextcloud(householdId: string): Promise<Viewer>;
}
