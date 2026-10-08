import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileMediaStore } from './file-store';
import { createFileMediaStreamSource } from './file-stream-source';

/*
 * File-store integration over a real temp directory: round-trips bytes, returns null for a
 * missing path, deletes without throwing, and streams what was written.
 */

const dirs: string[] = [];
async function freshDir() {
	const dir = await mkdtemp(join(tmpdir(), 'stella-media-'));
	dirs.push(dir);
	return dir;
}

async function freshStore() {
	return createFileMediaStore(await freshDir());
}

afterAll(async () => {
	await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('createFileMediaStore', () => {
	it('writes and reads back the same bytes', async () => {
		const store = await freshStore();
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		const path = await store.put('a.jpg', bytes);
		expect(path).toBe('a.jpg');
		expect(await store.read('a.jpg')).toEqual(bytes);
	});

	it('returns null for a missing file', async () => {
		const store = await freshStore();
		expect(await store.read('missing.jpg')).toBeNull();
	});

	it('deletes a file (and is a no-op when already gone)', async () => {
		const store = await freshStore();
		await store.put('b.jpg', new Uint8Array([9]));
		await store.delete('b.jpg');
		expect(await store.read('b.jpg')).toBeNull();
		await store.delete('b.jpg'); // must not throw
	});
});

describe('createFileMediaStreamSource', () => {
	it('opens a file the store wrote, to be streamed without reading it into memory first', async () => {
		const dir = await freshDir();
		const bytes = new Uint8Array([7, 8, 9]);
		await createFileMediaStore(dir).put('c.jpg', bytes);
		const opened = await createFileMediaStreamSource(dir).open('c.jpg');
		expect(opened?.size).toBe(3);
		expect(new Uint8Array(await new Response(opened!.body).arrayBuffer())).toEqual(bytes);
	});

	it('opens nothing for a missing file', async () => {
		const source = createFileMediaStreamSource(await freshDir());
		expect(await source.open('missing.jpg')).toBeNull();
	});
});
