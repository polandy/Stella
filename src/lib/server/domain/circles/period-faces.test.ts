import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { fixedClock } from '../testing';
import {
	readPeriodFaces,
	readThenView,
	type PeriodFaceMember,
	type PersonFace
} from './period-faces';

/*
 * The batched read behind *Then · Now* (docs/dev/02 §2.4.2): one read of every member's faces,
 * the pick per membership, each in its own window and its own circle.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const NOW = Date.parse('2026-11-25T10:00:00Z');
const at = (day: string) => Date.parse(`${day}T12:00:00Z`);

function depsWith(faces: PersonFace[]) {
	const asked: string[][] = [];
	return {
		asked,
		deps: {
			clock: fixedClock(NOW),
			faces: {
				async listFacesOfVisibleTo(_: Viewer, contactIds: readonly string[]) {
					asked.push([...contactIds]);
					return faces.filter((f) => contactIds.includes(f.contactId));
				}
			}
		}
	};
}

const classOf2018 = { id: 'class', startDate: '2018-08-01', endDate: '2019-07-31' };
const member = (over: Partial<PeriodFaceMember>): PeriodFaceMember => ({
	key: 'm-anna',
	contactId: 'anna',
	avatarPhotoId: 'anna-today',
	startDate: null,
	endDate: null,
	circle: classOf2018,
	...over
});

describe('readPeriodFaces', () => {
	it('reads nothing for no members', async () => {
		const { deps, asked } = depsWith([]);
		expect(await readPeriodFaces(deps, viewer, [])).toEqual({});
		expect(asked).toEqual([]);
	});

	it('reads each person once and picks per membership, in its own window', async () => {
		const { deps, asked } = depsWith([
			{ contactId: 'anna', photoId: 'anna-2018', datedAt: at('2018-09-01'), circleId: null },
			{ contactId: 'anna', photoId: 'anna-2021', datedAt: at('2021-09-01'), circleId: null },
			{ contactId: 'ben', photoId: 'ben-cut', datedAt: at('2018-10-05'), circleId: 'class' }
		]);
		const later = { id: 'class-4', startDate: '2021-08-01', endDate: '2022-07-31' };
		const faces = await readPeriodFaces(deps, viewer, [
			member({}),
			member({ key: 'm-anna-4', circle: later }),
			member({ key: 'm-ben', contactId: 'ben', avatarPhotoId: null })
		]);
		expect(asked).toEqual([['anna', 'ben']]);
		expect(faces).toEqual({
			'm-anna': { photoId: 'anna-2018', fit: 'inside', datedAt: at('2018-09-01') },
			'm-anna-4': { photoId: 'anna-2021', fit: 'inside', datedAt: at('2021-09-01') },
			'm-ben': { photoId: 'ben-cut', fit: 'circle', datedAt: at('2018-10-05') }
		});
	});

	it('takes the membership’s own period over the circle’s', async () => {
		const { deps } = depsWith([
			{ contactId: 'anna', photoId: 'anna-2018', datedAt: at('2018-09-01'), circleId: null },
			{ contactId: 'anna', photoId: 'anna-2019', datedAt: at('2019-05-01'), circleId: null }
		]);
		const faces = await readPeriodFaces(deps, viewer, [
			member({ startDate: '2018-08-01', endDate: '2018-12-31' })
		]);
		expect(faces['m-anna']).toEqual({
			photoId: 'anna-2018',
			fit: 'inside',
			datedAt: at('2018-09-01')
		});
	});

	it('ends an open period on the clock’s today', async () => {
		const { deps } = depsWith([
			{ contactId: 'anna', photoId: 'tomorrow', datedAt: at('2026-11-26'), circleId: null }
		]);
		const running = { id: 'club', startDate: '2026-01-01', endDate: null };
		const faces = await readPeriodFaces(deps, viewer, [member({ circle: running })]);
		expect(faces['m-anna']).toEqual({
			photoId: 'tomorrow',
			fit: 'after',
			datedAt: at('2026-11-26')
		});
	});
});

describe('readThenView', () => {
	const old = {
		contactId: 'anna',
		photoId: 'anna-2018',
		datedAt: at('2018-09-01'),
		circleId: null
	};

	it('shows the toggle when a face then differs, and opens an ended circle on Then', async () => {
		const { deps } = depsWith([old]);
		expect(await readThenView(deps, viewer, classOf2018, [member({})])).toEqual({
			faces: { 'm-anna': { photoId: 'anna-2018', fit: 'inside', datedAt: at('2018-09-01') } },
			shown: true,
			startsOnThen: true
		});
	});

	it('hides the toggle when every face then is today’s, and opens a running circle on Now', async () => {
		const { deps } = depsWith([]);
		const running = { id: 'club', startDate: '2026-01-01', endDate: null };
		const view = await readThenView(deps, viewer, running, [member({ circle: running })]);
		expect(view.shown).toBe(false);
		expect(view.startsOnThen).toBe(false);
	});

	it('has nothing to toggle in a circle without members', async () => {
		const { deps } = depsWith([old]);
		expect(await readThenView(deps, viewer, classOf2018, [])).toEqual({
			faces: {},
			shown: false,
			startsOnThen: true
		});
	});
});
