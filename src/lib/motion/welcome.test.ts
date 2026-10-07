import { describe, expect, it } from 'bun:test';
import { MOTION } from '../design/tokens';
import {
	WELCOME_EXIT,
	WELCOME_SEQUENCE,
	WELCOME_STILL_MS,
	dockMove,
	shouldWelcome,
	welcomeEndMs
} from './welcome';

const end = (part: keyof typeof WELCOME_SEQUENCE) =>
	WELCOME_SEQUENCE[part].delayMs + WELCOME_SEQUENCE[part].durationMs;

describe('whether a start is welcomed (docs/05 §5.11.4)', () => {
	it('animates the first start of a session', () => {
		expect(shouldWelcome(null, false)).toBe('animate');
	});

	it('shows the still mark to a reader who asked for less motion', () => {
		expect(shouldWelcome(null, true)).toBe('still');
	});

	it('shows nothing once the session has been welcomed, whatever the motion setting', () => {
		expect(shouldWelcome('1', false)).toBe('skip');
		expect(shouldWelcome('1', true)).toBe('skip');
		expect(shouldWelcome('', false)).toBe('skip');
	});
});

describe('the sequence', () => {
	it('starts with the pink centre and lights each node only once its thread has reached it', () => {
		expect(WELCOME_SEQUENCE['n-pink'].delayMs).toBe(0);
		expect(WELCOME_SEQUENCE['n-mauve'].delayMs).toBeGreaterThanOrEqual(end('t-mauve') - 60);
		expect(WELCOME_SEQUENCE['n-blue'].delayMs).toBeGreaterThanOrEqual(end('t-blue') - 60);
		expect(WELCOME_SEQUENCE['n-yellow'].delayMs).toBeGreaterThanOrEqual(end('t-yellow') - 60);
		expect(WELCOME_SEQUENCE['t-peach'].delayMs).toBeGreaterThanOrEqual(
			WELCOME_SEQUENCE['n-blue'].delayMs
		);
		expect(WELCOME_SEQUENCE['n-peach'].delayMs).toBeGreaterThanOrEqual(end('t-peach') - 60);
	});

	it('completes the constellation and the wordmark before the exit begins', () => {
		expect(end('n-peach')).toBeLessThanOrEqual(WELCOME_EXIT.startMs);
		expect(end('word')).toBeLessThanOrEqual(WELCOME_EXIT.startMs);
	});

	it('is over in about 1.4 s, the dock being the last thing to finish', () => {
		expect(welcomeEndMs()).toBe(1420);
		expect(WELCOME_EXIT.backdropMs).toBeLessThan(WELCOME_EXIT.dockMs);
		expect(WELCOME_EXIT.wordOutMs).toBeLessThan(WELCOME_EXIT.backdropMs);
	});

	it('fades in place on the same fade as everything else', () => {
		expect(WELCOME_EXIT.fadeMs).toBe(MOTION.fadeMs);
	});

	it('holds the still mark for 600 ms', () => {
		expect(WELCOME_STILL_MS).toBe(600);
	});
});

describe('where the mark docks', () => {
	const viewport = { width: 400, height: 800 };
	const mark = { left: 152, top: 352, width: 96, height: 96 };
	const topBarLogo = { left: 16, top: 12, width: 26, height: 26 };
	const hidden = { left: 0, top: 0, width: 0, height: 0 };

	it('flies the mark centre onto the logo centre and shrinks it to the logo', () => {
		expect(dockMove(mark, [topBarLogo], viewport)).toEqual({
			dx: 29 - 200,
			dy: 25 - 400,
			scale: 26 / 96
		});
	});

	it('takes the first logo that is laid out, skipping one hidden by its breakpoint', () => {
		expect(dockMove(mark, [hidden, topBarLogo], viewport)).toEqual(
			dockMove(mark, [topBarLogo], viewport)
		);
	});

	it('takes none that lies outside the screen', () => {
		const below = { left: 16, top: 900, width: 26, height: 26 };
		const left = { left: -40, top: 12, width: 26, height: 26 };
		expect(dockMove(mark, [below, left], viewport)).toBeNull();
	});

	it('fades in place when there is no logo, or the mark itself cannot be measured', () => {
		expect(dockMove(mark, [], viewport)).toBeNull();
		expect(dockMove(mark, [hidden], viewport)).toBeNull();
		expect(dockMove(hidden, [topBarLogo], viewport)).toBeNull();
	});
});
