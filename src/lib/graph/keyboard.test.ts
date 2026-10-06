import { describe, expect, it } from 'bun:test';
import { graphKeyAction, nextInDirection } from './keyboard';

/*
 * Walking the map from the keyboard (docs/05 §5.8): the arrow keys step to whoever stands
 * next in that direction on screen, so the keyboard follows the picture the reader is looking
 * at rather than an order they cannot see.
 */

const at = (x: number, y: number) => ({ x, y });

describe('nextInDirection', () => {
	const positions = new Map([
		['me', at(0, 0)],
		['right', at(100, 0)],
		['farRight', at(300, 0)],
		['above', at(0, -100)],
		['below', at(10, 120)],
		['left', at(-90, 20)]
	]);

	it('steps to the nearest person in each direction', () => {
		expect(nextInDirection(positions, 'me', 'right')).toBe('right');
		expect(nextInDirection(positions, 'me', 'left')).toBe('left');
		expect(nextInDirection(positions, 'me', 'up')).toBe('above');
		expect(nextInDirection(positions, 'me', 'down')).toBe('below');
	});

	it('prefers someone straight ahead over someone closer but off to the side', () => {
		const map = new Map([
			['me', at(0, 0)],
			['diagonal', at(60, 55)],
			['ahead', at(110, 5)]
		]);
		expect(nextInDirection(map, 'me', 'right')).toBe('ahead');
	});

	it('stays put when nobody stands in that direction', () => {
		expect(nextInDirection(positions, 'farRight', 'right')).toBeNull();
	});

	it('never steps to someone level with the start, which belongs to the side directions', () => {
		const map = new Map([
			['me', at(0, 0)],
			['level', at(100, 0)]
		]);
		expect(nextInDirection(map, 'me', 'up')).toBeNull();
		expect(nextInDirection(map, 'me', 'right')).toBe('level');
	});

	it('breaks a tie by id, so the same key always lands on the same person', () => {
		const map = new Map([
			['me', at(0, 0)],
			['b', at(100, 0)],
			['a', at(100, 0)]
		]);
		expect(nextInDirection(map, 'me', 'right')).toBe('a');
	});

	it('answers nothing for a start that is not on the map', () => {
		expect(nextInDirection(positions, 'nobody', 'right')).toBeNull();
	});
});

describe('graphKeyAction', () => {
	const positions = new Map([
		['me', at(0, 0)],
		['right', at(100, 0)]
	]);
	const key = (k: string, cursor: string | null = 'me') =>
		graphKeyAction({ key: k, cursor, positions, start: 'me' });

	it('moves the cursor with the arrow keys', () => {
		expect(key('ArrowRight')).toEqual({ kind: 'move', to: 'right' });
		expect(key('ArrowLeft', 'right')).toEqual({ kind: 'move', to: 'me' });
	});

	it('swallows an arrow key with nowhere to go, so the page does not scroll instead', () => {
		expect(key('ArrowUp')).toEqual({ kind: 'stay' });
	});

	it('places the cursor on the start with the first arrow key', () => {
		expect(key('ArrowRight', null)).toEqual({ kind: 'move', to: 'me' });
	});

	it('takes the cursor back to the start with Home', () => {
		expect(key('Home', 'right')).toEqual({ kind: 'move', to: 'me' });
	});

	it('falls back to anyone on the map when there is no start', () => {
		expect(graphKeyAction({ key: 'Home', cursor: null, positions, start: null })).toEqual({
			kind: 'move',
			to: 'me'
		});
	});

	it('activates the person under the cursor with Enter or Space, as a click would', () => {
		expect(key('Enter', 'right')).toEqual({ kind: 'activate', id: 'right' });
		expect(key(' ', 'right')).toEqual({ kind: 'activate', id: 'right' });
	});

	it('activates nobody before the cursor is placed', () => {
		expect(key('Enter', null)).toBeNull();
	});

	it('lets go of the selection with Escape', () => {
		expect(key('Escape')).toEqual({ kind: 'clear' });
	});

	it('leaves every other key to the browser', () => {
		expect(key('Tab')).toBeNull();
		expect(key('a')).toBeNull();
	});

	it('does nothing on an empty map', () => {
		expect(
			graphKeyAction({ key: 'ArrowRight', cursor: null, positions: new Map(), start: null })
		).toBeNull();
	});
});
