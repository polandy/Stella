import { mixPhotos, photoTabs, type PhotoTab } from '$lib/people/photo-card';
import { stripViews, viewShown, type StripView } from '$lib/immich/together';
import { ImmichPhotos } from './immich-photos.svelte';
import type { CardEntry, PersonPageData } from './types';

/*
 * What the person page's Photos card shows (docs/02 §2.14, §2.24.3, §2.24.8), shared by its
 * header — the tabs and their counts — and its body. The decisions are pure in
 * `$lib/people/photo-card` and `$lib/immich/together`; this is where the page's data, the
 * reader's choices and the Immich lists that load after the page meet.
 */

/** The reader's choices on the card, kept by the page. */
export interface PhotoView {
	tab: PhotoTab;
	/** Whether *All* was opened out past its first row. */
	expanded: boolean;
	/** The pair a relationship row's *Together* asked for (docs/02 §2.24.8). */
	askedByRow: string | null;
	/** The pair the Immich tab shows; null for the person's own photos. */
	shown: string | null;
}

/** What Immich said about the linked person, once it answered. */
type LinkedPerson = Awaited<NonNullable<PersonPageData['immichPerson']>>;

export class PhotoCardState {
	/** The person's own latest photos from Immich: the Immich part of *All*, and the Immich tab. */
	readonly own = new ImmichPhotos();
	/** The photos of the person with someone else, when the Immich tab shows a pair. */
	readonly pair = new ImmichPhotos();
	/** Immich's answer about the person — kept across a reload of the same person's data. */
	seen = $state<LinkedPerson | null>(null);

	/** `input` reads the page's data, the reader's choices and whether Stella is online. */
	constructor(
		private readonly input: () => {
			data: PersonPageData;
			view: PhotoView;
			online: boolean;
			/** Whether a photo's removal is held for the undo window: it is out of every list. */
			held: (photoId: string) => boolean;
		}
	) {
		let seenFor: string | null = null;
		$effect(() => {
			const promise = this.data.immichPerson;
			const contactId = this.data.contact.id;
			// Another person: what Immich said about the last one no longer holds.
			if (seenFor !== contactId) this.seen = null;
			seenFor = contactId;
			if (promise === null) {
				this.seen = null;
				return;
			}
			let current = true;
			void promise.then((answer) => {
				if (current) this.seen = answer;
			});
			return () => {
				current = false;
			};
		});
		$effect(() => {
			if (!this.linked) return;
			return this.own.load(this.contactId, null);
		});
		$effect(() => {
			const pairWith = this.pairWith;
			if (!this.linked || pairWith === null) return;
			return this.pair.load(this.contactId, pairWith);
		});
	}

	/*
	 * Read through getters: a field's initialiser may not name `input`, which TypeScript sees as
	 * set after it. The `$derived`s below are lazy, so by the time they run it is there.
	 */
	private get now() {
		return this.input();
	}
	private get data(): PersonPageData {
		return this.now.data;
	}

	/** A primitive, so a reload of the same person's data asks Immich nothing again. */
	readonly contactId = $derived(this.now.data.contact.id);
	/** Immich is on the instance and Stella is online: offline nothing from Immich is shown. */
	readonly showImmich = $derived(this.now.data.immich !== null && this.now.online);
	/** The person is linked, and Immich may be asked about them now. */
	readonly linked = $derived(this.showImmich && this.now.data.immich?.linked === true);
	readonly tabs = $derived(
		photoTabs({ immichAnswered: this.linked && this.seen?.state === 'linked' })
	);
	readonly tab = $derived(this.tabs.includes(this.now.view.tab) ? this.now.view.tab : 'all');
	/** How many photos Immich has of the person, when it answered and may count them. */
	readonly immichCount = $derived(this.seen?.state === 'linked' ? this.seen.photoCount : null);

	/** The Immich tab's lists (docs/02 §2.24.8): their own, and the pairs offered. */
	readonly views = $derived<StripView[]>(
		this.linked
			? stripViews({
					pageContactId: this.contactId,
					selfContactId: this.now.data.user.selfContactId,
					togetherWith: this.now.data.immich?.togetherWith ?? [],
					askedByRow: this.now.view.askedByRow
				})
			: []
	);
	readonly shownView = $derived(viewShown(this.views, this.now.view.shown));
	readonly pairWith = $derived(this.shownView.kind === 'own' ? null : this.shownView.contactId);
	/** The Immich list the Immich tab shows. */
	readonly immich = $derived(this.pairWith === null ? this.own : this.pair);

	/** The gallery without the photos being removed. */
	readonly gallery = $derived(this.now.data.gallery.filter((photo) => !this.now.held(photo.id)));

	readonly stella = $derived<CardEntry[]>(
		this.gallery.map((photo) => ({ source: 'stella', photo }))
	);
	readonly mixed = $derived<CardEntry[]>(
		mixPhotos({
			stella: this.gallery,
			immich: this.linked ? this.own.photos : [],
			immichComplete: !this.linked || this.own.complete
		})
	);
	readonly immichEntries = $derived<CardEntry[]>(
		this.immich.photos.map((photo) => ({ source: 'immich', photo }))
	);
	/** Every photo there is of the person, as *All 1,769 photos* says it. */
	readonly total = $derived(
		this.gallery.length + (this.linked ? (this.immichCount ?? this.own.photos.length) : 0)
	);
	/** *All* waits for Immich's first page, holding its row, rather than reshuffling under a tap. */
	readonly allLoading = $derived(this.linked && this.own.phase === 'loading');

	/** The list a tab shows, which its lightbox walks. */
	entries(tab: PhotoTab): CardEntry[] {
		if (tab === 'stella') return this.stella;
		if (tab === 'immich') return this.immichEntries;
		return this.mixed;
	}
}
