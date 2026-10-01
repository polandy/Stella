import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaStore, MediaStreamSource } from '../domain/media/avatars';

/*
 * Filesystem MediaStore over MEDIA_DIR (docs/04 §4.6). Files are addressed by a relative key
 * (e.g. "photo-id.jpg"); that relative path is what the DB stores, so the volume can move
 * without rewriting rows. Uses Bun's file APIs; Bun.write creates parent directories.
 */
export function createFileMediaStore(baseDir: string): MediaStore & MediaStreamSource {
	const resolve = (path: string) => join(baseDir, path);

	return {
		async put(key: string, bytes: Uint8Array): Promise<string> {
			await Bun.write(resolve(key), bytes);
			return key;
		},

		async read(path: string): Promise<Uint8Array | null> {
			const file = Bun.file(resolve(path));
			if (!(await file.exists())) return null;
			return new Uint8Array(await file.arrayBuffer());
		},

		async open(path: string): Promise<{ body: Blob; size: number } | null> {
			// A `Bun.file` is a lazy Blob: a Response built on it streams from disk.
			const file = Bun.file(resolve(path));
			if (!(await file.exists())) return null;
			return { body: file, size: file.size };
		},

		async delete(path: string): Promise<void> {
			await rm(resolve(path), { force: true });
		}
	};
}
