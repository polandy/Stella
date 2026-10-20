import { describe, expect, it } from 'bun:test';
import { circleRepositoryWith, fixedClock, inMemoryCircleNesting, someCircle } from '../testing';
import { CircleGoneError } from './circle-details';
import type { Circle } from './circles';
import {
	CircleLoopError,
	CircleParentGoneError,
	closesLoop,
	moveCircle,
	planCircleMove
} from './nesting';

/*
 * Where a circle sits (docs/02 §2.4.2): moving it under another circle or taking it out to stand
 * for itself. Seeing the circle and its new parent is enough; the loop check walks the whole
 * household's nesting, hidden circles included, and never names one (ADR-125).
 */

const NOW = 1_700_000_000_000;
const viewer = { id: 'u1', householdId: 'h1' };

/**
 * A household whose `visible` circles the viewer sees, nested as `parents` says — hidden ones
 * included, as the adapter reads them. `setParent` records each write and moves the nesting.
 */
function household(visible: string[], parents: Record<string, string | null>) {
	const writes: { circleId: string; parentId: string | null; at: number }[] = [];
	const nesting = { ...parents };
	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id): Promise<Circle | null> =>
			visible.includes(id) ? someCircle(id, `Circle ${id}`) : null,
		setParent: async (_viewer, circleId, parentId, at) => {
			if (!visible.includes(circleId)) return false;
			writes.push({ circleId, parentId, at });
			nesting[circleId] = parentId;
			return true;
		}
	});
	return {
		deps: { circles, nesting: inMemoryCircleNesting(nesting), clock: fixedClock(NOW) },
		writes
	};
}

describe('closesLoop', () => {
	const parents = new Map<string, string | null>([
		['school', null],
		['class', 'school'],
		['group', 'class']
	]);

	it('sees a circle put inside itself or anything below it', () => {
		expect(closesLoop('school', 'school', parents)).toBe(true);
		expect(closesLoop('school', 'class', parents)).toBe(true);
		expect(closesLoop('school', 'group', parents)).toBe(true);
	});

	it('lets a circle go under anything that is not below it', () => {
		expect(closesLoop('group', 'school', parents)).toBe(false);
		expect(closesLoop('class', 'other', parents)).toBe(false);
	});

	it('stops on a stored loop instead of hanging', () => {
		const broken = new Map<string, string | null>([
			['a', 'b'],
			['b', 'a']
		]);
		expect(closesLoop('c', 'a', broken)).toBe(false);
	});
});

describe('moveCircle', () => {
	it('puts a circle under a visible parent, stamped with the clock', async () => {
		const { deps, writes } = household(['school', 'class'], { school: null, class: null });
		expect(await moveCircle(deps, viewer, 'class', 'school')).toEqual({
			circleId: 'class',
			name: 'Circle class',
			from: null,
			to: 'school'
		});
		expect(writes).toEqual([{ circleId: 'class', parentId: 'school', at: NOW }]);
	});

	it('detaches a circle to stand for itself', async () => {
		const { deps, writes } = household(['school', 'class'], { school: null, class: 'school' });
		expect(await moveCircle(deps, viewer, 'class', null)).toMatchObject({
			from: 'school',
			to: null
		});
		expect(writes).toEqual([{ circleId: 'class', parentId: null, at: NOW }]);
	});

	it('moves a circle out of its old parent into the new one, its own sub-circles along', async () => {
		const { deps, writes } = household(['a', 'b', 'class', 'group'], {
			a: null,
			b: null,
			class: 'a',
			group: 'class'
		});
		expect(await moveCircle(deps, viewer, 'class', 'b')).toMatchObject({ from: 'a', to: 'b' });
		// Only the moved circle is written; its sub-circle keeps pointing at it.
		expect(writes).toEqual([{ circleId: 'class', parentId: 'b', at: NOW }]);
	});

	it('takes an undo back through the same check', async () => {
		const { deps, writes } = household(['a', 'b', 'class'], { a: null, b: null, class: 'a' });
		const move = await moveCircle(deps, viewer, 'class', 'b');
		await moveCircle(deps, viewer, 'class', move.from);
		expect(writes.map((w) => w.parentId)).toEqual(['b', 'a']);
	});

	it('refuses an undo that would now close a loop', async () => {
		const { deps, writes } = household(['a', 'class'], { a: null, class: 'a' });
		const move = await moveCircle(deps, viewer, 'class', null);
		// Meanwhile someone put `a` inside `class`, so going back would loop.
		await moveCircle(deps, viewer, 'a', 'class');
		await expect(moveCircle(deps, viewer, 'class', move.from)).rejects.toThrow(CircleLoopError);
		expect(writes).toHaveLength(2);
	});

	it('writes nothing when the circle already sits there', async () => {
		const { deps, writes } = household(['school', 'class'], { school: null, class: 'school' });
		expect(await moveCircle(deps, viewer, 'class', 'school')).toMatchObject({
			from: 'school',
			to: 'school'
		});
		expect(writes).toEqual([]);
	});

	it('refuses a circle inside itself or one of its sub-circles', async () => {
		const { deps, writes } = household(['school', 'class'], { school: null, class: 'school' });
		await expect(moveCircle(deps, viewer, 'school', 'school')).rejects.toThrow(CircleLoopError);
		await expect(moveCircle(deps, viewer, 'school', 'class')).rejects.toThrow(CircleLoopError);
		expect(writes).toEqual([]);
	});

	it('refuses a loop through a hidden circle, naming only the moved one', async () => {
		// school ⊃ hidden (private, not the viewer's) ⊃ visible: putting school in visible loops.
		const { deps, writes } = household(['school', 'visible'], {
			school: null,
			hidden: 'school',
			visible: 'hidden'
		});
		const refusal = await moveCircle(deps, viewer, 'school', 'visible').catch((e: unknown) => e);
		expect(refusal).toBeInstanceOf(CircleLoopError);
		expect((refusal as Error).message).toContain('Circle school');
		expect((refusal as Error).message).not.toContain('hidden');
		expect(writes).toEqual([]);
	});

	it('refuses a parent the viewer cannot see', async () => {
		const { deps, writes } = household(['class'], { class: null, secret: null });
		await expect(moveCircle(deps, viewer, 'class', 'secret')).rejects.toThrow(
			CircleParentGoneError
		);
		await expect(moveCircle(deps, viewer, 'class', 'gone')).rejects.toThrow(CircleParentGoneError);
		expect(writes).toEqual([]);
	});

	it('answers CircleGoneError for a circle the viewer cannot see', async () => {
		const { deps, writes } = household(['school'], { school: null, secret: null });
		await expect(moveCircle(deps, viewer, 'secret', 'school')).rejects.toThrow(CircleGoneError);
		expect(writes).toEqual([]);
	});

	it('answers CircleGoneError when the circle went between the check and the write', async () => {
		const { deps } = household(['school', 'class'], { school: null, class: null });
		const vanishing = {
			...deps,
			circles: { ...deps.circles, setParent: async () => false }
		};
		await expect(moveCircle(vanishing, viewer, 'class', 'school')).rejects.toThrow(CircleGoneError);
	});
});

describe('planCircleMove', () => {
	it('reports a hidden parent as standing for itself, and leaves it when asked for that', async () => {
		// A shared class under a private school the viewer cannot see stands on top for them.
		const { deps, writes } = household(['class'], { school: null, class: 'school' });
		const plan = await planCircleMove(deps, viewer, 'class', null);
		expect(plan).toEqual({ circleId: 'class', name: 'Circle class', from: null, to: null });
		await moveCircle(deps, viewer, 'class', null);
		expect(writes).toEqual([]);
	});
});
