import { MAX_SHARED_PHOTOS } from '$lib/share/shared';
import { stalePendingShares } from '$lib/share/pending';

/*
 * Keeps a share from another app on the device (docs/02 §2.18.3), from the moment the service
 * worker takes it to the moment the share sheet has saved it. An adapter like `outbox-store`:
 * IndexedDB, and nothing decided here. The worker writes, the sheet reads and lets go.
 *
 * IndexedDB because the photos are stored as they came, as blobs, and because the worker has
 * no `localStorage` to write to.
 */

/** One photo of a share, as the other app handed it over. */
export interface SharedPhoto {
	name: string;
	blob: Blob;
}

/** A share waiting for the sheet. */
export interface PendingShare {
	id: string;
	title: string;
	text: string;
	url: string;
	/** At most `MAX_SHARED_PHOTOS`; `photoCount` says how many came. */
	photos: SharedPhoto[];
	photoCount: number;
	savedAt: number;
}

const DATABASE = 'stella-share';
const STORE = 'shares';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function inTransaction<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore, done: (value: T) => void) => void
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			let result: T;
			work(tx.objectStore(STORE), (value) => (result = value));
			tx.oncomplete = () => resolve(result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

function text(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value : '';
}

/** The share a posted form carries, photos beyond the cap left out. */
export function shareFrom(form: FormData, id: string, now: number): PendingShare {
	const images = form
		.getAll('files')
		.filter((entry): entry is File => entry instanceof File && entry.type.startsWith('image/'));
	return {
		id,
		title: text(form.get('title')),
		text: text(form.get('text')),
		url: text(form.get('url')),
		photos: images.slice(0, MAX_SHARED_PHOTOS).map((file) => ({ name: file.name, blob: file })),
		photoCount: images.length,
		savedAt: now
	};
}

/** Keep `share`, and let go of any left unfinished for too long (`stalePendingShares`). */
export function keepShare(share: PendingShare): Promise<void> {
	return inTransaction<void>('readwrite', (store) => {
		const all = store.getAll();
		all.onsuccess = () => {
			const kept = all.result as PendingShare[];
			for (const id of stalePendingShares(kept, share.savedAt)) store.delete(id);
			store.put(share);
		};
	});
}

/** The share kept under `id`, or null once it was saved or let go. */
export function readShare(id: string): Promise<PendingShare | null> {
	return inTransaction<PendingShare | null>('readonly', (store, done) => {
		const request = store.get(id);
		request.onsuccess = () => done((request.result as PendingShare | undefined) ?? null);
	});
}

/** Let go of the share under `id`: it was saved, or set aside. */
export function forgetShare(id: string): Promise<void> {
	return inTransaction<void>('readwrite', (store) => {
		store.delete(id);
	});
}
