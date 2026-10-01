import type { Point } from './layout/geometry';

/*
 * Walking the map from the keyboard (docs/05 §5.8). Pure: positions in, the next step out, so
 * the canvas adapter only reports where everyone stands and carries the step out.
 */

/** A step on screen, as the arrow keys name them. */
export type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_OF_KEY: Record<string, Direction> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right'
};

/** Splits an offset into how far it lies ahead in a direction and how far off to the side. */
const AXES: Record<Direction, (dx: number, dy: number) => { ahead: number; sideways: number }> = {
	right: (dx, dy) => ({ ahead: dx, sideways: dy }),
	left: (dx, dy) => ({ ahead: -dx, sideways: dy }),
	down: (dx, dy) => ({ ahead: dy, sideways: dx }),
	up: (dx, dy) => ({ ahead: -dy, sideways: dx })
};

/**
 * How much more sideways distance counts than distance ahead. Above 1, someone straight ahead
 * wins over someone nearer but off to the side, which is where the reader's eye goes.
 */
const SIDEWAYS_WEIGHT = 2;

/**
 * Whoever stands next from `from` in `direction` on screen (y grows downwards), or null when
 * nobody does. Only people strictly ahead count; among them the nearest wins, sideways
 * distance weighing double, and a tie goes to the smaller id so a key always lands the same.
 */
export function nextInDirection(
	positions: ReadonlyMap<string, Point>,
	from: string,
	direction: Direction
): string | null {
	const origin = positions.get(from);
	if (!origin) return null;
	let best: { id: string; score: number } | null = null;
	for (const [id, p] of positions) {
		if (id === from) continue;
		const dx = p.x - origin.x;
		const dy = p.y - origin.y;
		const { ahead, sideways } = AXES[direction](dx, dy);
		if (ahead <= 0) continue;
		const score = ahead + SIDEWAYS_WEIGHT * Math.abs(sideways);
		if (!best || score < best.score || (score === best.score && id < best.id)) best = { id, score };
	}
	return best?.id ?? null;
}

/** What a key pressed on the map asks for; null leaves the key to the browser. */
export type GraphKeyAction =
	| { kind: 'move'; to: string }
	/** An arrow key with nowhere to go: still the map's, so the page does not scroll. */
	| { kind: 'stay' }
	/** Enter or Space on the person under the cursor — the same as clicking them. */
	| { kind: 'activate'; id: string }
	| { kind: 'clear' };

/** A key pressed on the map, with what it is read against. */
export interface GraphKey {
	key: string;
	/** Who the keyboard is on, or null before it has been placed. */
	cursor: string | null;
	/** Where everyone shown stands. */
	positions: ReadonlyMap<string, Point>;
	/** Where the cursor starts and Home returns to: the selection or the centre. */
	start: string | null;
}

/**
 * What a key on the map asks for. The first arrow key places the cursor on `start` (or, with
 * none, on the first person by id) rather than stepping from nowhere.
 */
export function graphKeyAction({ key, cursor, positions, start }: GraphKey): GraphKeyAction | null {
	if (positions.size === 0) return null;
	const home = start !== null && positions.has(start) ? start : [...positions.keys()].sort()[0];
	const on = cursor !== null && positions.has(cursor) ? cursor : null;

	const direction = DIRECTION_OF_KEY[key];
	if (direction) {
		if (on === null) return { kind: 'move', to: home };
		const to = nextInDirection(positions, on, direction);
		return to ? { kind: 'move', to } : { kind: 'stay' };
	}
	if (key === 'Home') return { kind: 'move', to: home };
	if (key === 'Enter' || key === ' ') return on === null ? null : { kind: 'activate', id: on };
	if (key === 'Escape') return { kind: 'clear' };
	return null;
}
