import type { Clock } from '../../clock';

/** A clock a test moves on by hand: it stands still otherwise (docs/08 §8.4.2). */
export interface FixedClock extends Clock {
	advance(ms: number): void;
}

/** A clock that reads `now` until the test calls `advance`. */
export function fixedClock(now: number): FixedClock {
	let current = now;
	return {
		now: () => current,
		advance: (ms) => void (current += ms)
	};
}
