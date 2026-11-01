/*
 * A share waits on the device between the service worker taking it and the sheet saving it
 * (docs/02 §2.18.3). One that is never finished — the sheet closed, the phone put away — must
 * not hold its photos for ever.
 */

/** How long an unfinished share is kept: long enough to come back to it, short enough to forget. */
export const PENDING_SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The ids of the shares older than that at `now`. */
export function stalePendingShares(
	shares: readonly { id: string; savedAt: number }[],
	now: number
): string[] {
	return shares.filter((share) => now - share.savedAt > PENDING_SHARE_MAX_AGE_MS).map((s) => s.id);
}
