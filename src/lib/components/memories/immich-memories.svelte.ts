import type {
	ImmichMemories as ImmichMemoriesAnswer,
	ImmichMemoryPage,
	ImmichMemoryYear
} from '$lib/immich/on-this-day';

/*
 * *On this day* from Immich (docs/02 §2.12.1), as Home's band and `/on-this-day` load it: asked
 * for after the page is drawn, so a slow Immich never holds Home up, and nothing of it kept on the
 * device. Quiet on failure — an instance without Immich, or an Immich that did not answer, simply
 * adds nothing; the server log and Settings say why.
 */
export class ImmichMemories {
	years = $state<ImmichMemoryYear[]>([]);
	/** `loading` until Immich answers, or does not. */
	phase = $state<'idle' | 'loading' | 'done'>('idle');
	/** The year whose next photos are on their way. */
	loadingMore = $state<number | null>(null);
	#day: string | null = null;

	/**
	 * Asks for every earlier year's photos of `day`. Returns the cleanup for an `$effect`: an answer
	 * for a day no longer shown is dropped.
	 */
	load(day: string): () => void {
		this.#day = day;
		this.phase = 'loading';
		this.years = [];
		void fetchJson<ImmichMemoriesAnswer>(new URLSearchParams({ day })).then((answer) => {
			if (this.#day !== day) return;
			if (answer?.state === 'years') this.years = answer.years;
			this.phase = 'done';
		});
		return () => {
			if (this.#day === day) this.#day = null;
		};
	}

	/** The next photos of `year`, below the ones shown. */
	async showMore(year: number): Promise<void> {
		const day = this.#day;
		const shown = this.years.find((y) => y.year === year);
		if (day === null || !shown || this.loadingMore !== null) return;
		this.loadingMore = year;
		const params = new URLSearchParams({
			day,
			year: String(year),
			from: String(shown.photos.length)
		});
		const page = await fetchJson<ImmichMemoryPage>(params);
		this.loadingMore = null;
		if (this.#day !== day || page?.state !== 'photos') return;
		this.years = this.years.map((y) =>
			y.year !== year
				? y
				: {
						...y,
						photos: [...y.photos, ...page.photos],
						// Immich lost some since it counted them: no *Show more* that brings nothing.
						total: page.photos.length === 0 ? y.photos.length : y.total
					}
		);
	}
}

async function fetchJson<T>(params: URLSearchParams): Promise<T | null> {
	try {
		const response = await fetch(`/immich/on-this-day?${params}`);
		return response.ok ? ((await response.json()) as T) : null;
	} catch {
		// The network went away mid-request: the page is about to say Stella is offline.
		return null;
	}
}
