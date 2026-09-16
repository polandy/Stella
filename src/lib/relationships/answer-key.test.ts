import { describe, expect, it } from 'bun:test';
import { ANSWER_ANCHOR_PATTERN, answerAnchor, answerKey, withAnchor } from './answer-key';

/*
 * The key an answered suggestion is held under while its undo window is open
 * (docs/02 §2.4.1, §2.23).
 *
 * A claim is `(relation, pair)` and never a rule — that is what makes one *no* hold however
 * another rule reaches the same two people later (docs/concepts/relationship-suggestions.md
 * §6.4). The undo key has to inherit that exactly: the household screen can reach the same
 * claim from either end of a sibling group, and two keys for one claim would let a member
 * answer it twice and undo only half of it.
 */

describe('answerKey', () => {
	it('gives one key to a claim reached from either end', () => {
		expect(answerKey('sibling', 'lisa', 'hans')).toBe(answerKey('sibling', 'hans', 'lisa'));
	});

	it('keeps two relations over the same pair apart', () => {
		expect(answerKey('parent', 'lisa', 'hans')).not.toBe(answerKey('sibling', 'lisa', 'hans'));
	});

	/* Namespaced, so a suggestion and a stored relationship sharing an id never collide. */
	it('is a removal key, so the toast region can hold it like any other', () => {
		expect(answerKey('parent', 'a', 'b')).toStartWith('suggestion:');
	});
});

describe('answerAnchor', () => {
	/*
	 * The degraded path. With JavaScript off an answer still posts and still reloads, so the
	 * redirect carries this and the browser lands beside the row instead of at the top.
	 */
	it('names the claim from either end', () => {
		expect(answerAnchor('parent', '01J', '01K')).toBe(answerAnchor('parent', '01K', '01J'));
	});

	/* A fragment may not carry the space `pairKey` joins with, or the anchor silently misses. */
	it('carries only what a fragment may', () => {
		expect(answerAnchor('sibling', '01J', '01K')).toMatch(ANSWER_ANCHOR_PATTERN);
		expect(answerAnchor('sibling', '01J', '01K')).not.toInclude(' ');
	});

	/*
	 * The pattern is what the redirect checks before appending, so anything that could steer the
	 * browser elsewhere has to fail it — the field is a hidden input and therefore whatever the
	 * browser sends.
	 */
	it('rejects anything that is not one', () => {
		for (const hostile of ['claim-a/../..', 'claim-a#x', '../evil', 'claim a', '']) {
			expect(ANSWER_ANCHOR_PATTERN.test(hostile)).toBe(false);
		}
	});
});

describe('withAnchor', () => {
	/*
	 * The field is a hidden input, so it is whatever the browser sends. `returnedTo` builds the
	 * path itself and cannot be steered; this is the only part of the redirect the client writes,
	 * so it appends nothing it did not produce.
	 */
	it('lands the reload beside the row it answered', () => {
		expect(withAnchor('/settings/relationships?review', 'claim-parent-01J-01K')).toBe(
			'/settings/relationships?review#claim-parent-01J-01K'
		);
	});

	it('returns to the place alone when nothing was carried', () => {
		expect(withAnchor('/settings/relationships', null)).toBe('/settings/relationships');
	});

	it('appends nothing it did not produce itself', () => {
		for (const hostile of ['../evil', 'claim-a/../..', 'claim a', '']) {
			expect(withAnchor('/settings/relationships', hostile)).toBe('/settings/relationships');
		}
	});
});
