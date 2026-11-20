import type {
	LibraryAlbums,
	LibraryMonths,
	LibraryPhoto,
	LibraryView
} from '#lib/immich/library.js';
import { tabOf, type LibraryTab } from '#lib/immich/library-albums.js';
import {
	groupByDay,
	weekLookup,
	type LibraryLevel,
	type LibraryWeek
} from '#lib/immich/library-nav.js';
import { libraryQueryUrl, type LibraryQuery } from '#lib/immich/library-pick.js';

/*
 * Where the photo picker is in the Immich timeline or its albums, and what it has read there
 * (docs/dev/02 §2.24.9): the browser adapter of `#lib/immich/library-nav.js`, asking
 * `/immich/library`, `/immich/library/months` and `/immich/library/albums`. Only the latest
 * question may fill the body: a slower answer to an earlier one arrives last and is dropped.
 */

/** What is read a page at a time: a month of the timeline, or an album. */
export type PagedSource = { month: string } | { album: string };

/** A month or an album as read so far, a page at a time. */
export interface PagedRead {
	source: PagedSource;
	photos: LibraryPhoto[];
	nextCursor: string | null;
	loading: boolean;
	failed: boolean;
}

async function ask<T>(url: string, fallback: T): Promise<T> {
	try {
		const response = await fetch(url);
		return response.ok ? ((await response.json()) as T) : fallback;
	} catch {
		return fallback;
	}
}

export class LibraryBrowser {
	at = $state<LibraryLevel>({ level: 'day', day: '' });
	/** The words of the search shown, or null while the timeline is browsed. */
	searched = $state<string | null>(null);
	/** A day, or a search's matches; null while it loads. */
	view = $state<LibraryView | null>(null);
	paged = $state<PagedRead | null>(null);
	/** The years overview's months; null while they load. */
	timeline = $state<LibraryMonths | null>(null);
	/** The album list; null while it loads. */
	albums = $state<LibraryAlbums | null>(null);
	/** The album list's filter by name, kept while an album is open. */
	albumFilter = $state('');
	/** Every photo seen since opening, so a tick survives a step to another level. */
	readonly seen = new Map<string, LibraryPhoto>();

	#latest = 0;
	#timelineAsked = 0;
	#albumsAsked = 0;
	/** Where each tab was last, for a switch back to it. */
	#lastAt: Record<LibraryTab, LibraryLevel> = {
		time: { level: 'day', day: '' },
		albums: { level: 'albums' }
	};
	#paging: Promise<void> | null = null;
	readonly #onshown: () => void;

	/** `onshown` runs once a new level or search has been put up, to scroll it to its top. */
	constructor(onshown: () => void) {
		this.#onshown = onshown;
	}

	/** Whether the trail starts at all years: only once the key has read the timeline. */
	get overview(): boolean {
		return this.timeline?.state === 'months';
	}

	/** Whether the albums are offered: not while they load, nor to a key without `album.read`. */
	get hasAlbums(): boolean {
		return this.albums !== null && this.albums.state !== 'forbidden';
	}

	open(day: string) {
		this.seen.clear();
		this.albumFilter = '';
		this.#lastAt = { time: { level: 'day', day }, albums: { level: 'albums' } };
		void this.readTimeline();
		void this.readAlbums();
		this.go({ level: 'day', day });
	}

	async readAlbums() {
		const mine = ++this.#albumsAsked;
		this.albums = null;
		const answer = await ask<LibraryAlbums>('/immich/library/albums', { state: 'unreachable' });
		if (mine === this.#albumsAsked) this.albums = answer;
	}

	/** Goes back to where the tab was last. */
	switchTo(tab: LibraryTab) {
		this.go(this.#lastAt[tab]);
	}

	async readTimeline() {
		const mine = ++this.#timelineAsked;
		this.timeline = null;
		const answer = await ask<LibraryMonths>('/immich/library/months', { state: 'unreachable' });
		if (mine === this.#timelineAsked) this.timeline = answer;
	}

	go(at: LibraryLevel) {
		this.searched = null;
		this.at = at;
		this.#lastAt[tabOf(at)] = at;
		if (at.level === 'day') void this.#show({ day: at.day });
		else if (at.level === 'month') void this.#readFirstPage({ month: at.month });
		else if (at.level === 'album') void this.#readFirstPage({ album: at.album });
		else {
			this.#latest++;
			this.#onshown();
		}
	}

	/** Searches by description; no words go back to where the timeline was. */
	search(words: string) {
		if (words === '') return this.go(this.at);
		this.searched = words;
		void this.#show({ query: words });
	}

	/** Asks again what did not answer. */
	retry() {
		if (this.searched !== null) void this.#show({ query: this.searched });
		else if (this.at.level === 'years' || this.at.level === 'year') void this.readTimeline();
		else if (this.at.level === 'albums') void this.readAlbums();
		else this.go(this.at);
	}

	/** The next page, when there is one; one already on its way is the one awaited. */
	more(): Promise<void> {
		const read = this.paged;
		if (read?.loading && this.#paging) return this.#paging;
		if (!read || read.loading || read.nextCursor === null) return Promise.resolve();
		this.#paging = this.#readNextPage(read);
		return this.#paging;
	}

	/**
	 * Reads on until the month shows where `week` starts: its first day with photos, or null for a
	 * week without any, or when the month cannot be read that far.
	 */
	async reach(week: LibraryWeek): Promise<string | null> {
		const read = this.paged;
		for (;;) {
			if (!read || this.paged !== read) return null;
			const { day, settled } = weekLookup(groupByDay(read.photos), week);
			if (settled || read.nextCursor === null || read.failed) return day;
			await this.more();
		}
	}

	async #readNextPage(read: PagedRead) {
		const mine = this.#latest;
		read.loading = true;
		read.failed = false;
		const answer = await ask<LibraryView>(
			libraryQueryUrl({ ...read.source, cursor: read.nextCursor }),
			{ state: 'unreachable' }
		);
		if (mine !== this.#latest) return;
		read.loading = false;
		if (answer.state !== 'month' && answer.state !== 'album') {
			read.failed = true;
			return;
		}
		this.#remember(answer.photos);
		read.photos.push(...answer.photos);
		read.nextCursor = answer.nextCursor;
	}

	async #readFirstPage(source: PagedSource) {
		const mine = ++this.#latest;
		this.paged = { source, photos: [], nextCursor: null, loading: true, failed: false };
		this.#onshown();
		const answer = await ask<LibraryView>(libraryQueryUrl({ ...source, cursor: null }), {
			state: 'unreachable'
		});
		if (mine !== this.#latest) return;
		if (answer.state !== 'month' && answer.state !== 'album') {
			this.paged = { source, photos: [], nextCursor: null, loading: false, failed: true };
			return;
		}
		this.#remember(answer.photos);
		this.paged = {
			source,
			photos: answer.photos,
			nextCursor: answer.nextCursor,
			loading: false,
			failed: false
		};
	}

	async #show(query: LibraryQuery) {
		const mine = ++this.#latest;
		this.view = null;
		const answer = await ask<LibraryView>(libraryQueryUrl(query), { state: 'unreachable' });
		if (mine !== this.#latest) return;
		if (answer.state === 'day' || answer.state === 'found') this.#remember(answer.photos);
		this.view = answer;
		this.#onshown();
	}

	#remember(photos: readonly LibraryPhoto[]) {
		for (const photo of photos) this.seen.set(photo.id, photo);
	}
}
