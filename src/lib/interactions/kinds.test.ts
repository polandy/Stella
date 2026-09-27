import { describe, expect, it } from 'bun:test';
import { INTERACTION_KINDS, isInteractionKind } from './kinds';

/* Interaction kinds (docs/02 §2.6): reading one back from a form field. */

describe('isInteractionKind', () => {
	it('knows every kind the form offers, and nothing else', () => {
		for (const kind of INTERACTION_KINDS) expect(isInteractionKind(kind)).toBe(true);
		expect(isInteractionKind('telegram')).toBe(false);
		expect(isInteractionKind('')).toBe(false);
	});
});
