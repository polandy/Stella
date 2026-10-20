import { describe, expect, it } from 'bun:test';
import { circleRepositoryWith, fixedClock, inMemoryCircleNesting, someCircle } from '../testing';
import {
	BlankCircleNameError,
	CircleGoneError,
	CirclePeriodBackwardsError,
	readCircleDetails
} from './circle-details';
import type { CircleDetails } from './circles';
import { CircleLoopError, CircleParentGoneError } from './nesting';
import { updateCircle } from './update-circle';

/*
 * Editing a circle's details (docs/02 §2.4.2): name, kind, colour, description and period, for
 * anyone who sees the circle. The validation is the one `createCircle` uses.
 */

const NOW = 1_700_000_000_000;
const viewer = { id: 'u1', householdId: 'h1' };

/**
 * A repository whose writes record what they were asked and find `visible` circles only, over a
 * household nested as `parents` (hidden circles included).
 */
function recordingRepo(visible: string[] = ['k1'], parents: Record<string, string | null> = {}) {
	const writes: { viewer: unknown; circleId: string; details: CircleDetails; at: number }[] = [];
	const moves: { circleId: string; parentId: string | null }[] = [];
	const circles = circleRepositoryWith({
		update: async (who, circleId, details, at) => {
			if (!visible.includes(circleId)) return false;
			writes.push({ viewer: who, circleId, details, at });
			return true;
		},
		getVisibleTo: async (_who, id) =>
			visible.includes(id) ? someCircle(id, `Circle ${id}`) : null,
		setParent: async (_who, circleId, parentId) => {
			moves.push({ circleId, parentId });
			return visible.includes(circleId);
		}
	});
	return {
		deps: { circles, nesting: inMemoryCircleNesting(parents), clock: fixedClock(NOW) },
		writes,
		moves
	};
}

describe('readCircleDetails', () => {
	it('trims, defaults blanks and keeps a period that runs forward', () => {
		expect(
			readCircleDetails({
				name: '  Class 1B ',
				kind: 'class',
				color: '',
				description: '   ',
				startDate: '2025-08-18',
				endDate: '2026-07-03'
			})
		).toEqual({
			name: 'Class 1B',
			kind: 'class',
			color: 'blue',
			description: null,
			startDate: '2025-08-18',
			endDate: '2026-07-03'
		});
	});

	it('refuses a blank name with a phrase', () => {
		expect(() => readCircleDetails({ name: '  ' })).toThrow(BlankCircleNameError);
	});

	it('refuses a period that ends before it starts', () => {
		expect(() =>
			readCircleDetails({ name: 'A', startDate: '2026-08-01', endDate: '2026-07-31' })
		).toThrow(CirclePeriodBackwardsError);
	});

	it('allows a one-day period, an open end and an open start', () => {
		expect(() =>
			readCircleDetails({ name: 'A', startDate: '2026-08-01', endDate: '2026-08-01' })
		).not.toThrow();
		expect(readCircleDetails({ name: 'A', startDate: '2026-08-01' }).endDate).toBeNull();
		expect(readCircleDetails({ name: 'A', endDate: '2026-08-01' }).startDate).toBeNull();
	});

	it('compares an imported partial date at the precision it was written in', () => {
		expect(() =>
			readCircleDetails({ name: 'A', startDate: '2025', endDate: '2025-07-01' })
		).not.toThrow();
		expect(() =>
			readCircleDetails({ name: 'A', startDate: '2025-08', endDate: '2025-07-31' })
		).toThrow(CirclePeriodBackwardsError);
	});

	it('fails loud on an unknown kind or colour', () => {
		expect(() => readCircleDetails({ name: 'A', kind: 'cabal' })).toThrow();
		expect(() => readCircleDetails({ name: 'A', color: 'chartreuse' })).toThrow();
	});
});

describe('updateCircle', () => {
	it('writes every field, validated, stamped with the clock', async () => {
		const { deps, writes } = recordingRepo();
		await updateCircle(deps, viewer, 'k1', {
			name: ' Class 2B ',
			kind: 'class',
			color: 'mauve',
			description: 'Primarschule Längenfeld',
			startDate: '2026-08-17',
			endDate: '2027-07-02'
		});
		expect(writes).toEqual([
			{
				viewer,
				circleId: 'k1',
				details: {
					name: 'Class 2B',
					kind: 'class',
					color: 'mauve',
					description: 'Primarschule Längenfeld',
					startDate: '2026-08-17',
					endDate: '2027-07-02'
				},
				at: NOW
			}
		]);
	});

	it('clears the description and the period when they are left blank', async () => {
		const { deps, writes } = recordingRepo();
		await updateCircle(deps, viewer, 'k1', { name: 'Choir', description: '', startDate: '' });
		expect(writes[0].details).toMatchObject({ description: null, startDate: null, endDate: null });
	});

	it('refuses a blank name and a backwards period before writing anything', async () => {
		const { deps, writes } = recordingRepo();
		await expect(updateCircle(deps, viewer, 'k1', { name: ' ' })).rejects.toThrow(
			BlankCircleNameError
		);
		await expect(
			updateCircle(deps, viewer, 'k1', {
				name: 'Choir',
				startDate: '2026-02-01',
				endDate: '2026-01-01'
			})
		).rejects.toThrow(CirclePeriodBackwardsError);
		expect(writes).toEqual([]);
	});

	it('answers CircleGoneError for a circle the viewer cannot see or that is gone', async () => {
		const { deps } = recordingRepo(['k1']);
		await expect(updateCircle(deps, viewer, 'k2', { name: 'Choir' })).rejects.toThrow(
			CircleGoneError
		);
	});

	it('leaves the parent alone when the form does not send one', async () => {
		const { deps, moves } = recordingRepo(['k1'], { k1: 'school' });
		expect(await updateCircle(deps, viewer, 'k1', { name: 'Choir' })).toBeNull();
		expect(moves).toEqual([]);
	});

	it('moves the circle under the parent the form chose, and says where from', async () => {
		const { deps, writes, moves } = recordingRepo(['k1', 'school'], { k1: null, school: null });
		expect(await updateCircle(deps, viewer, 'k1', { name: 'Class', parentId: 'school' })).toEqual({
			circleId: 'k1',
			name: 'Circle k1',
			from: null,
			to: 'school'
		});
		expect(writes).toHaveLength(1);
		expect(moves).toEqual([{ circleId: 'k1', parentId: 'school' }]);
	});

	it('takes the circle out to stand for itself', async () => {
		const { deps, moves } = recordingRepo(['k1', 'school'], { k1: 'school', school: null });
		await updateCircle(deps, viewer, 'k1', { name: 'Class', parentId: null });
		expect(moves).toEqual([{ circleId: 'k1', parentId: null }]);
	});

	it('writes no move when the form sends the parent the circle has', async () => {
		const { deps, moves } = recordingRepo(['k1', 'school'], { k1: 'school', school: null });
		expect(
			await updateCircle(deps, viewer, 'k1', { name: 'Class', parentId: 'school' })
		).toMatchObject({ from: 'school', to: 'school' });
		expect(moves).toEqual([]);
	});

	it('refuses a loop — through a hidden circle too — before writing anything', async () => {
		const { deps, writes, moves } = recordingRepo(['k1', 'inner'], {
			k1: null,
			hidden: 'k1',
			inner: 'hidden'
		});
		await expect(
			updateCircle(deps, viewer, 'k1', { name: 'School', parentId: 'inner' })
		).rejects.toThrow(CircleLoopError);
		expect(writes).toEqual([]);
		expect(moves).toEqual([]);
	});

	it('refuses a parent the viewer cannot see before writing anything', async () => {
		const { deps, writes } = recordingRepo(['k1'], { k1: null, secret: null });
		await expect(
			updateCircle(deps, viewer, 'k1', { name: 'Class', parentId: 'secret' })
		).rejects.toThrow(CircleParentGoneError);
		expect(writes).toEqual([]);
	});
});
