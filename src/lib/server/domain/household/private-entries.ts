/*
 * Whether a member has written anything private (docs/dev/02 §2.10.1): the one fact the
 * device-unlock hint on Home waits for, since there is nothing to unlock before it.
 */

/** Port: the member's own private entries, counted by kind only as far as "any". */
export interface PrivateEntryReads {
	/** True when the member authored a private note, moment or touchpoint. */
	hasPrivateEntry(memberId: string): Promise<boolean>;
}
