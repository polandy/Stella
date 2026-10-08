import { describe, expect, it } from 'bun:test';
import { draftWorthUndo, withLogAsked, withMomentAsked } from './story-forms';

/*
 * The Activity card's one inline spot (docs/05 §5.5): the moment composer and the log form
 * share it, one at a time.
 */

describe('withMomentAsked', () => {
	it('opens the composer on a closed card', () => {
		expect(withMomentAsked(null)).toEqual({ open: 'moment', opened: true });
	});

	it('folds the log form away to make room', () => {
		expect(withMomentAsked('log')).toEqual({ open: 'moment', opened: true });
	});

	it('only brings the reader back when the composer is already open', () => {
		expect(withMomentAsked('moment')).toEqual({ open: 'moment', opened: false });
	});
});

describe('withLogAsked', () => {
	it('opens the log form, folding the composer away', () => {
		expect(withLogAsked('moment', true)).toBe('log');
		expect(withLogAsked(null, true)).toBe('log');
	});

	it('closes the log form when it is the one open', () => {
		expect(withLogAsked('log', false)).toBeNull();
	});

	it('leaves the composer open when the log form is closed again', () => {
		expect(withLogAsked('moment', false)).toBe('moment');
	});
});

describe('draftWorthUndo', () => {
	it('offers a draft with words in it back', () => {
		const draft = { body: 'Coffee after training', visibility: 'shared' as const };
		expect(draftWorthUndo(draft)).toBe(draft);
	});

	it('lets an empty or blank draft go without an offer', () => {
		expect(draftWorthUndo({ body: '' })).toBeNull();
		expect(draftWorthUndo({ body: '  \n ' })).toBeNull();
		expect(draftWorthUndo(null)).toBeNull();
	});
});
