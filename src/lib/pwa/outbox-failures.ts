import type { OutboxItem, OutboxState } from './outbox';

/*
 * A command Stella keeps failing on (docs/dev/02 §2.18.1): a failure is a fault on Stella's side,
 * not a reason the member can act on, and the same command fails the same way next time. So the
 * device counts the rounds it failed in and, after a few, leaves it *stuck*: not sent again, and
 * no longer holding up the items behind it, until the member edits or discards it. Pure, like
 * `outbox.ts`.
 */

/** Failed rounds after which an item stops being sent on its own. */
export const STUCK_AFTER_FAILURES = 5;

/**
 * Failures closer together than this count once: rounds start on every save and every return
 * to the tab, and a short outage on Stella's side must not use up an item's tries.
 */
export const FAILURE_SPACING_MS = 60_000;

/** `item` after Stella failed on it at `now`: counted, and stuck once it has failed often enough. */
export function failedAt(item: OutboxItem, now: number): OutboxItem {
	const counts = item.lastFailedAt === undefined || now - item.lastFailedAt >= FAILURE_SPACING_MS;
	const attempts = (item.attempts ?? 0) + (counts ? 1 : 0);
	const counted: OutboxItem = {
		...item,
		attempts,
		lastFailedAt: counts ? now : item.lastFailedAt,
		unanswered: true
	};
	return { ...counted, state: restingState(counted) };
}

/** Where an item rests when nothing is being done with it: refused, stuck, or waiting. */
export function restingState(item: OutboxItem): OutboxState {
	if (item.reason !== null) return 'refused';
	return (item.attempts ?? 0) >= STUCK_AFTER_FAILURES ? 'stuck' : 'pending';
}
