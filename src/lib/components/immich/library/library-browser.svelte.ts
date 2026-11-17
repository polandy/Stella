import type { LibraryMonths, LibraryPhoto, LibraryView } from '$lib/immich/library';
import {
	groupByDay,
	weekLookup,
	type LibraryLevel,
	type LibraryWeek
} from '$lib/immich/library-nav';
import { libraryQueryUrl, type LibraryQuery } from '$lib/immich/library-pick';

/*
 * Where the photo picker is in the Immich timeline, and what it has read there (docs/dev/02
 * §2.24.9): the browser adapter of `$lib/immich/library-nav`, asking `/immich/library` and
 * `/immich/library/months`. Only the latest question may fill the body: a slower answer to an
 * earlier one arrives last and is dropped.
 */

/** A month as read so far, a page at a time. */
export interface MonthRead {
	month: string;
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
	month = $state<MonthRead | null>(null);
	/** The years overview's months; null while they load. */
	timeline = $state<LibraryMonths | null>(null);
	/** Every photo seen since opening, so a tick survives a step to another level. */
	readonly seen = new Map<string, LibraryPhoto>();

	#latest = 0;
	#timelineAsked = 0;
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

	open(day: string) {
		this.seen.clear();
		void this.readTimeline();
		this.go({ level: 'day', day });
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
		if (at.level === 'day') void this.#show({ day: at.day });
		else if (at.level === 'month') void this.#readMonth(at.month);
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
		else this.go(this.at);
	}

	/** The month's next page, when there is one; one already on its way is the one awaited. */
	more(): Promise<void> {
		const read = this.month;
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
		const read = this.month;
		for (;;) {
			if (!read || this.month !== read) return null;
			const { day, settled } = weekLookup(groupByDay(read.photos), week);
			if (settled || read.nextCursor === null || read.failed) return day;
			await this.more();
		}
	}

	async #readNextPage(read: MonthRead) {
		const mine = this.#latest;
		read.loading = true;
		read.failed = false;
		const answer = await ask<LibraryView>(
			libraryQueryUrl({ month: read.month, cursor: read.nextCursor }),
			{ state: 'unreachable' }
		);
		if (mine !== this.#latest) return;
		read.loading = false;
		if (answer.state !== 'month') {
			read.failed = true;
			return;
		}
		this.#remember(answer.photos);
		read.photos.push(...answer.photos);
		read.nextCursor = answer.nextCursor;
	}

	async #readMonth(month: string) {
		const mine = ++this.#latest;
		this.month = { month, photos: [], nextCursor: null, loading: true, failed: false };
		this.#onshown();
		const answer = await ask<LibraryView>(libraryQueryUrl({ month, cursor: null }), {
			state: 'unreachable'
		});
		if (mine !== this.#latest) return;
		if (answer.state !== 'month') {
			this.month = { month, photos: [], nextCursor: null, loading: false, failed: true };
			return;
		}
		this.#remember(answer.photos);
		this.month = {
			month,
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
