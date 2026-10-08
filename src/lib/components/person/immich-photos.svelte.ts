import { withPage, type GlimpsePhoto } from '$lib/immich/strip';
import { fetchGlimpse } from './immich-glimpse';

/*
 * One list of a linked person's photos from Immich, as the Photos card shows it (docs/02
 * §2.24.3, §2.24.8): their own latest, or those of them with someone else, twelve at a time.
 * Asked for after the page has loaded, so a slow Immich never holds the page up; nothing of it is
 * kept on the device.
 *
 * Quiet on failure: the card's Immich line already says when Immich did not answer or no longer
 * has the person, so the list is then simply empty and complete.
 */
export class ImmichPhotos {
	photos = $state<GlimpsePhoto[]>([]);
	nextCursor = $state<string | null>(null);
	/**
	 * `loading` until the first page answers; `none` when there is nothing to show, and
	 * `noneTogether` when two people simply have no photo together.
	 */
	phase = $state<'idle' | 'loading' | 'shown' | 'none' | 'noneTogether'>('idle');
	loadingMore = $state(false);
	#asked: { contactId: string; togetherWith: string | null } | null = null;

	/** Whether every photo there is has been loaded — or none ever will be. */
	get complete(): boolean {
		return this.phase !== 'loading' && this.nextCursor === null;
	}

	/**
	 * Asks for the first page of `contactId`'s photos, or theirs with `togetherWith`. Returns
	 * the cleanup for an `$effect`: an answer for a person or pair no longer asked about is dropped.
	 */
	load(contactId: string, togetherWith: string | null): () => void {
		const asked = { contactId, togetherWith };
		this.#asked = asked;
		this.phase = 'loading';
		this.photos = [];
		this.nextCursor = null;
		void fetchGlimpse(contactId, null, togetherWith).then((page) => {
			if (this.#asked !== asked) return;
			if (page?.state === 'photos' && page.photos.length > 0) {
				this.photos = page.photos;
				this.nextCursor = page.nextCursor;
				this.phase = 'shown';
			} else {
				// Two people with no photo together are said so; anything else the line says.
				this.phase = togetherWith !== null && page?.state === 'photos' ? 'noneTogether' : 'none';
			}
		});
		return () => {
			if (this.#asked === asked) this.#asked = null;
		};
	}

	/** The next twelve, below the ones shown. */
	async showMore(): Promise<void> {
		const asked = this.#asked;
		if (asked === null || this.nextCursor === null || this.loadingMore) return;
		this.loadingMore = true;
		const page = await fetchGlimpse(asked.contactId, this.nextCursor, asked.togetherWith);
		this.loadingMore = false;
		if (this.#asked !== asked) return;
		if (page?.state === 'photos') {
			this.photos = withPage(this.photos, page.photos);
			this.nextCursor = page.nextCursor;
		} else {
			// Immich stopped answering between pages: what is shown stays, the button goes.
			this.nextCursor = null;
		}
	}
}
