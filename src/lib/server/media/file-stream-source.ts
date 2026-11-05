import type { MediaStreamSource } from '../domain/media/avatars';
import { mediaFileIn } from './media-path';

/*
 * Filesystem MediaStreamSource over MEDIA_DIR (docs/04 §4.6): the bytes `/media/[id]` streams,
 * addressed by the same relative paths the `MediaStore` (`file-store.ts`) wrote.
 */
export function createFileMediaStreamSource(baseDir: string): MediaStreamSource {
	return {
		async open(path: string): Promise<{ body: Blob; size: number } | null> {
			// A `Bun.file` is a lazy Blob: a Response built on it streams from disk.
			const file = Bun.file(mediaFileIn(baseDir, path));
			if (!(await file.exists())) return null;
			return { body: file, size: file.size };
		}
	};
}
