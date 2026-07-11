/*
 * Clock port — injected wherever logic needs the current time, so units stay
 * deterministic (docs/08 §8.2, §8.3). Production wires `systemClock`; tests pass a fake.
 */

export interface Clock {
	/** Current time as Unix epoch milliseconds. */
	now(): number;
}

export const systemClock: Clock = {
	now: () => Date.now()
};
