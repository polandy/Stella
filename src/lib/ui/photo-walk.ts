/*
 * Walking the gallery from the open photo (docs/02 §2.14). The arrow keys wrap at either end
 * and are left alone while a text field has focus, so typing a caption moves its caret rather
 * than the photo (docs/05 §5.9).
 */

/** What the decision reads from a key press in the open photo. */
export interface PhotoKey {
	key: string;
	/** The index of the photo that is open. */
	at: number;
	count: number;
	/** Whether a text field has focus, which owns the arrows then. */
	typing: boolean;
}

/** The index the key leads to, or `null` when the key is not a step through the gallery. */
export function photoAfterKey({ key, at, count, typing }: PhotoKey): number | null {
	if (typing || count === 0) return null;
	if (key === 'ArrowRight') return (at + 1) % count;
	if (key === 'ArrowLeft') return (at - 1 + count) % count;
	return null;
}
