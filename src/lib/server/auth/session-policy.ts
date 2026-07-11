/*
 * Session expiry policy — pure sliding-expiration rules (docs/02 §2.1, docs/08 §8.3).
 * `now` and durations are passed in; nothing here reads the clock or does I/O, so every
 * decision is deterministic and unit-testable.
 */

/** How long a fresh or refreshed session stays valid. */
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Expiry instant for a session created/refreshed at `now`. */
export function newExpiry(now: number, durationMs: number = SESSION_DURATION_MS): number {
	return now + durationMs;
}

export type SessionValidation =
	| { status: 'expired' }
	/** Still valid; keep the current expiry. */
	| { status: 'active'; expiresAt: number }
	/** Still valid but past halfway; extend to the returned expiry. */
	| { status: 'refresh'; expiresAt: number };

/**
 * Decide what to do with a stored session at `now`: expired, still active, or due for a
 * sliding refresh (once it is past the halfway point of the duration window).
 */
export function validateExpiry(
	session: { expiresAt: number },
	now: number,
	durationMs: number = SESSION_DURATION_MS
): SessionValidation {
	if (now >= session.expiresAt) {
		return { status: 'expired' };
	}
	const halfwayInstant = session.expiresAt - durationMs / 2;
	if (now >= halfwayInstant) {
		return { status: 'refresh', expiresAt: newExpiry(now, durationMs) };
	}
	return { status: 'active', expiresAt: session.expiresAt };
}
