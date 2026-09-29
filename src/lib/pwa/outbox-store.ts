import type { OutboxItem } from './outbox';

/*
 * Keeps the outbox on the device (docs/concepts/offline-capture.md §4). An adapter: it holds
 * IndexedDB and decides nothing — what the list *means* is `outbox.ts`. The whole list is one
 * record, changed in one transaction at a time; it is a handful of items. Everything stored is
 * plain data — pass `$state.snapshot`, never a Svelte proxy, which cannot be cloned.
 *
 * IndexedDB rather than `localStorage`: it survives the storage pressure that evicts caches
 * first, it is reachable from a service worker should one ever send, and it will hold photos
 * as they are rather than as base64 strings.
 */

const DATABASE = 'stella-outbox';
const STORE = 'outbox';
const KEY = 'items';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Every item on the device, whoever's it is. */
export async function readOutbox(): Promise<OutboxItem[]> {
	const db = await open();
	try {
		return await new Promise((resolve, reject) => {
			const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
			request.onsuccess = () => resolve((request.result as OutboxItem[] | undefined) ?? []);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

/**
 * Change the list on the device with `change`, read and written in one transaction. Two tabs
 * each holding a copy and writing it back whole would lose each other's moments; IndexedDB
 * runs read-write transactions on a store one at a time, across tabs, so this cannot.
 * `change` runs inside the transaction and must not wait on anything. Resolves with the list
 * as written, once it is durable.
 */
export async function updateOutbox(
	change: (items: OutboxItem[]) => OutboxItem[]
): Promise<OutboxItem[]> {
	const db = await open();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			let written: OutboxItem[] = [];
			const read = store.get(KEY);
			read.onsuccess = () => {
				written = change((read.result as OutboxItem[] | undefined) ?? []);
				store.put(written, KEY);
			};
			tx.oncomplete = () => resolve(written);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}
