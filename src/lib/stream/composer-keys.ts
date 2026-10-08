/*
 * What a key does in the moment composer (docs/05 §5.7). The open @-list takes the arrows,
 * Enter, Tab and Escape first; with it closed, Escape cancels where the page offers a Cancel and
 * ⌘⏎ saves. Pure; `MomentComposer` calls `preventDefault` when the key is `consumed`.
 */

export type TextKeyIntent = 'next' | 'previous' | 'choose' | 'closePicker' | 'cancel' | 'save';

export interface TextKeyAt {
	/** The @-list is open with at least one row. */
	listOpen: boolean;
	cancellable: boolean;
	canSave: boolean;
}

export function textKey(
	press: { key: string; mod: boolean },
	at: TextKeyAt
): { intent: TextKeyIntent; consumed: boolean } | null {
	const take = (intent: TextKeyIntent) => ({ intent, consumed: true });
	if (at.listOpen) {
		if (press.key === 'ArrowDown') return take('next');
		if (press.key === 'ArrowUp') return take('previous');
		if (press.key === 'Enter' || press.key === 'Tab') return take('choose');
		// Not consumed: closing the list is all it does here.
		if (press.key === 'Escape') return { intent: 'closePicker', consumed: false };
	}
	if (press.key === 'Escape' && at.cancellable) return take('cancel');
	if (press.key === 'Enter' && press.mod && at.canSave) return take('save');
	return null;
}

/*
 * A caret moved by the arrow keys may have entered or left an @-handle, so the list is asked
 * again — except for Up and Down while the list is open: those moved its highlight on keydown,
 * and asking again would put it straight back on the first row.
 */
export function keyupAsksPicker(key: string, listOpen: boolean): boolean {
	if (!key.startsWith('Arrow')) return false;
	return !((key === 'ArrowUp' || key === 'ArrowDown') && listOpen);
}

/** The panel sits inside the moment's form: Enter adds the person, it never saves the moment. */
export function createPanelKey(key: string): 'add' | 'cancel' | null {
	if (key === 'Enter') return 'add';
	if (key === 'Escape') return 'cancel';
	return null;
}
