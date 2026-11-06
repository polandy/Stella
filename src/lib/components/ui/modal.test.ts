import { describe, expect, it } from 'bun:test';
import { syncModal, type ModalDialog } from './modal';

/*
 * `showModal()` on a dialog that is already open throws `InvalidStateError`, and `close()` on a
 * closed one fires no `close` event a caller may be waiting for. So the dialog is only told what
 * changed, and the opener's fresh start runs once per opening, not on every effect run.
 */

function fakeDialog(open = false) {
	const calls: string[] = [];
	const dialog: ModalDialog = {
		open,
		showModal() {
			if (this.open) throw new Error('InvalidStateError');
			calls.push('showModal');
			this.open = true;
		},
		close() {
			calls.push('close');
			this.open = false;
		}
	};
	return { dialog, calls };
}

describe('syncModal', () => {
	it('opens a closed dialog, starting it afresh first', () => {
		const { dialog, calls } = fakeDialog();
		syncModal(dialog, true, () => calls.push('fresh'));
		expect(calls).toEqual(['fresh', 'showModal']);
		expect(dialog.open).toBe(true);
	});

	it('leaves an open dialog alone, and does not start it afresh again', () => {
		const { dialog, calls } = fakeDialog(true);
		syncModal(dialog, true, () => calls.push('fresh'));
		expect(calls).toEqual([]);
	});

	it('closes an open dialog once it should be shut', () => {
		const { dialog, calls } = fakeDialog(true);
		syncModal(dialog, false, () => calls.push('fresh'));
		expect(calls).toEqual(['close']);
		expect(dialog.open).toBe(false);
	});

	it('does nothing to a closed dialog that should stay shut', () => {
		const { dialog, calls } = fakeDialog();
		syncModal(dialog, false);
		expect(calls).toEqual([]);
	});

	it('waits for the element: before it is bound there is nothing to open', () => {
		const calls: string[] = [];
		syncModal(undefined, true, () => calls.push('fresh'));
		expect(calls).toEqual([]);
	});
});
