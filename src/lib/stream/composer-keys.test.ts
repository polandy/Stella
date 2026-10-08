import { describe, expect, it } from 'bun:test';
import { createPanelKey, keyupAsksPicker, textKey } from './composer-keys';

/* The composer's keys (docs/05 §5.7): the @-list's first, then Escape and the save shortcut. */

const at = { listOpen: true, cancellable: true, canSave: true };
const press = (key: string, mod = false) => ({ key, mod });

describe('in the field', () => {
	it('moves through and chooses from the open list', () => {
		expect(textKey(press('ArrowDown'), at)).toEqual({ intent: 'next', consumed: true });
		expect(textKey(press('ArrowUp'), at)).toEqual({ intent: 'previous', consumed: true });
		expect(textKey(press('Enter'), at)).toEqual({ intent: 'choose', consumed: true });
		expect(textKey(press('Tab'), at)).toEqual({ intent: 'choose', consumed: true });
	});

	it('closes the list on Escape and lets the key go on', () => {
		expect(textKey(press('Escape'), at)).toEqual({ intent: 'closePicker', consumed: false });
	});

	it('cancels on Escape with the list closed, when the page offers a Cancel', () => {
		const closed = { ...at, listOpen: false };
		expect(textKey(press('Escape'), closed)).toEqual({ intent: 'cancel', consumed: true });
		expect(textKey(press('Escape'), { ...closed, cancellable: false })).toBeNull();
	});

	it('saves on ⌘⏎ only when the moment can be saved', () => {
		const closed = { ...at, listOpen: false };
		expect(textKey(press('Enter', true), closed)).toEqual({ intent: 'save', consumed: true });
		expect(textKey(press('Enter', true), { ...closed, canSave: false })).toBeNull();
		expect(textKey(press('Enter'), closed)).toBeNull();
	});
});

describe('after a key is let go', () => {
	it('asks the list again when an arrow moved the caret, but not Up or Down inside it', () => {
		expect(keyupAsksPicker('ArrowLeft', true)).toBe(true);
		expect(keyupAsksPicker('ArrowDown', false)).toBe(true);
		expect(keyupAsksPicker('ArrowDown', true)).toBe(false);
		expect(keyupAsksPicker('a', false)).toBe(false);
	});
});

describe('in the new-person panel', () => {
	it('adds on Enter and cancels on Escape, never saving the moment', () => {
		expect(createPanelKey('Enter')).toBe('add');
		expect(createPanelKey('Escape')).toBe('cancel');
		expect(createPanelKey('a')).toBeNull();
	});
});
