import { tick } from 'svelte';
import { photoAfterKey } from '$lib/ui/photo-walk';

/*
 * The walk the circle page's lightbox takes (docs/02 §2.4.2, concept §3.1): the cover, a role's
 * banner and the Photos section each open it on one photo among the ones it may step through —
 * one role's, or the grid as filtered. Kept as ids, so a save that reloads the page keeps the
 * same photo open, and the page closes it when that photo is gone. The arrow keys wrap as in a
 * person's gallery (`$lib/ui/photo-walk`); closing hands focus back where it belongs.
 */
export class PhotoWalk {
	/** The photos being walked, and which one is open; null with the lightbox closed. */
	current = $state<{ ids: string[]; at: number; opener: HTMLElement } | null>(null);

	/** The id of the photo that is open, or null. */
	get photoId(): string | null {
		return this.current ? (this.current.ids[this.current.at] ?? null) : null;
	}

	open(ids: string[], at: number, opener: HTMLElement) {
		this.current = { ids, at: Math.max(0, at), opener };
	}

	step(by: -1 | 1) {
		const walk = this.current;
		if (walk) walk.at = (walk.at + by + walk.ids.length) % walk.ids.length;
	}

	/** The arrow keys step, except while a field has them. */
	onkeydown(event: KeyboardEvent) {
		const walk = this.current;
		if (!walk) return;
		const target = event.target as HTMLElement;
		const typing = target.matches('input, textarea, select') || target.isContentEditable;
		const next = photoAfterKey({ key: event.key, at: walk.at, count: walk.ids.length, typing });
		if (next !== null) walk.at = next;
	}

	/**
	 * Close, and give focus back: to the grid tile of the photo now showing when the walk began
	 * in the grid, else to the strip that opened it. After the dialog has gone — until then the
	 * page is inert and cannot take focus.
	 */
	close() {
		const closing = this.current;
		this.current = null;
		if (!closing) return;
		const fromGrid = closing.opener.hasAttribute('data-photo-tile');
		void tick().then(() => {
			const tile = document.querySelector<HTMLElement>(`[data-photo-tile="${closing.ids[closing.at]}"]`);
			(fromGrid && tile ? tile : closing.opener).focus();
		});
	}
}
