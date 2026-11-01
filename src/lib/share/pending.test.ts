import { describe, expect, it } from 'bun:test';
import { PENDING_SHARE_MAX_AGE_MS, stalePendingShares } from './pending';

describe('shares waiting on the device', () => {
	const now = 1_800_000_000_000;

	it('lets go of a share nobody finished within a day', () => {
		const shares = [
			{ id: 'old', savedAt: now - PENDING_SHARE_MAX_AGE_MS - 1 },
			{ id: 'fresh', savedAt: now - 1000 }
		];

		expect(stalePendingShares(shares, now)).toEqual(['old']);
	});

	it('keeps a share from a device clock that runs ahead', () => {
		expect(stalePendingShares([{ id: 'ahead', savedAt: now + 60_000 }], now)).toEqual([]);
	});
});
