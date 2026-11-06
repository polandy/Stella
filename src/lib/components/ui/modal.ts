/*
 * A `<dialog>` that opens and shuts with a prop (docs/05 §5.7). The component's effect says
 * *whether* it should be open; this tells the element only what changed, because `showModal()`
 * on an open dialog throws, and runs the opener's fresh start once per opening.
 *
 * Dialogs that are open for as long as they are mounted (the lightboxes) use
 * `{@attach (d) => d.showModal()}` instead — there is nothing to keep in step.
 */

/** As much of an `HTMLDialogElement` as keeping it in step needs. */
export interface ModalDialog {
	readonly open: boolean;
	showModal(): void;
	close(): void;
}

/**
 * Call from an `$effect`: `$effect(() => { syncModal(dialog, open, reset); })`. `onOpen` runs
 * just before the dialog shows — clearing a query, a selection, last time's error.
 */
export function syncModal(
	dialog: ModalDialog | undefined,
	open: boolean,
	onOpen?: () => void
): void {
	if (!dialog) return;
	if (open && !dialog.open) {
		onOpen?.();
		dialog.showModal();
	} else if (!open && dialog.open) dialog.close();
}
