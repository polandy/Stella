import { describe, expect, it } from 'bun:test';
import { parseAnswers } from './answers';

/*
 * The review's answers arrive as one JSON field (docs/02 §2.16). Anything that is not a set
 * of well-formed answers is refused whole, never half applied.
 */

describe('parseAnswers', () => {
	it('reads every answer by card key', () => {
		const answers = parseAnswers(
			JSON.stringify({
				'anna-1': { kind: 'same', personId: 'c-anna', takeCard: ['birthday'] },
				'felix-1': { kind: 'new' },
				'gina-1': { kind: 'skip' }
			})
		);

		expect(answers).toEqual(
			new Map([
				['anna-1', { kind: 'same', personId: 'c-anna', takeCard: ['birthday'] }],
				['felix-1', { kind: 'new' }],
				['gina-1', { kind: 'skip' }]
			])
		);
	});

	it('refuses what is not JSON, an unknown answer or a conflict the card cannot have', () => {
		for (const raw of [
			null,
			'not json',
			'[]',
			JSON.stringify({ a: { kind: 'maybe' } }),
			JSON.stringify({ a: { kind: 'same', personId: '', takeCard: [] } }),
			JSON.stringify({ a: { kind: 'same', personId: 'c', takeCard: ['company'] } })
		]) {
			expect(parseAnswers(raw)).toBeNull();
		}
	});
});
