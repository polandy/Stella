import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { ImmichGateway } from './gateway';
import type { ImmichLibraryDeps } from './library';
import { LIBRARY_MONTH_PAGE, readLibraryMonth, readLibraryMonths } from './library-timeline';
import { createImmichMediaSigner } from './signed-media';
import { libraryOf } from './test-library';
import { fixedClock } from '../testing';

/*
 * The timeline as the picker walks it (docs/dev/02 §2.24.9): the months that hold photos, for the
 * years overview, and a month read a page at a time on the camera's clock.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

function setup(gateway: ImmichLibraryDeps['gateway']) {
	const signer = createImmichMediaSigner({
		secret: 'test-secret',
		clock: fixedClock(1_700_000_000_000)
	});
	return { gateway, signer } satisfies ImmichLibraryDeps;
}

const A = '0a000000-0000-4000-8000-000000000000';
const asset = (n: number) => `${n.toString(16).padStart(8, '0')}${A.slice(8)}`;

describe('readLibraryMonths', () => {
	it('gives the months that hold photos, newest first', async () => {
		const gateway = libraryOf({});
		const deps = setup({
			...gateway,
			timelineMonths: async () => ({
				ok: true,
				value: [
					{ month: '2026-10', count: 812 },
					{ month: '2026-09', count: 0 },
					{ month: '2025-01', count: 3 }
				]
			})
		});
		expect(await readLibraryMonths(deps)).toEqual({
			state: 'months',
			months: [
				{ month: '2026-10', count: 812 },
				{ month: '2025-01', count: 3 }
			]
		});
	});

	it('reads a key without timeline.read as forbidden, any other failure as unreachable', async () => {
		const failing = (failure: 'forbidden' | 'unreachable' | 'unauthorized') =>
			setup({
				...libraryOf({}),
				timelineMonths: async () => ({ ok: false, failure })
			} satisfies ImmichLibraryDeps['gateway']);
		expect(await readLibraryMonths(failing('forbidden'))).toEqual({ state: 'forbidden' });
		expect(await readLibraryMonths(failing('unreachable'))).toEqual({ state: 'unreachable' });
		expect(await readLibraryMonths(failing('unauthorized'))).toEqual({ state: 'unreachable' });
	});
});

describe('readLibraryMonth', () => {
	const taken: Record<string, string> = {
		[asset(1)]: '2026-09-30T23:00:00',
		[asset(2)]: '2026-10-01T00:30:00',
		[asset(3)]: '2026-10-21T12:00:00',
		[asset(4)]: '2026-10-31T23:59:00',
		[asset(5)]: '2026-11-01T00:10:00'
	};

	it('lists a month’s photos on the camera’s clock, oldest first, its edges included', async () => {
		const view = await readLibraryMonth(setup(libraryOf(taken)), viewer, '2026-10', null);
		if (view.state !== 'month') throw new Error(view.state);
		expect(view.month).toBe('2026-10');
		expect(view.photos.map(({ id }) => id)).toEqual([asset(2), asset(3), asset(4)]);
		expect(view.photos[0].takenAt).toBe('2026-10-01T00:30:00');
		expect(view.nextCursor).toBeNull();
	});

	it('reads a month in pages; a page that is short, even empty, but has a cursor goes on', async () => {
		const many: Record<string, string> = { [asset(0)]: '2026-09-30T20:00:00' };
		for (let n = 1; n <= LIBRARY_MONTH_PAGE + 5; n++) {
			many[asset(n)] =
				`2026-10-02T${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}:00`;
		}
		const deps = setup(libraryOf(many));
		const first = await readLibraryMonth(deps, viewer, '2026-10', null);
		if (first.state !== 'month') throw new Error(first.state);
		// The window reaches into September, so one of the hundred read is not October's.
		expect(first.photos).toHaveLength(LIBRARY_MONTH_PAGE - 1);
		expect(first.nextCursor).not.toBeNull();
		const second = await readLibraryMonth(deps, viewer, '2026-10', first.nextCursor);
		if (second.state !== 'month') throw new Error(second.state);
		expect(second.photos).toHaveLength(6);
		expect(second.nextCursor).toBeNull();
	});

	it('reads a failure in Immich as unreachable', async () => {
		const gateway = {
			...libraryOf({}),
			takenAssets: async () => ({ ok: false, failure: 'unreachable' })
		} satisfies Pick<ImmichGateway, 'takenAssets' | 'smartSearch' | 'timelineMonths'>;
		expect(await readLibraryMonth(setup(gateway), viewer, '2026-10', null)).toEqual({
			state: 'unreachable'
		});
	});
});
