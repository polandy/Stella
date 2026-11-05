import { resolve, sep } from 'node:path';

/*
 * The one gate between a stored media path and the disk (docs/04 §4.7). Every caller today
 * hands over a generated `<ulid>.<ext>` or a path the restore already vetted, but the store is
 * the last line: a future caller forwarding a DB value must not reach outside MEDIA_DIR.
 */

export class MediaPathOutsideError extends Error {
	constructor(path: string) {
		super(`Media path leaves the media directory: ${path}`);
		this.name = 'MediaPathOutsideError';
	}
}

/** The absolute file a relative media path names, or a throw when it would leave `baseDir`. */
export function mediaFileIn(baseDir: string, path: string): string {
	const base = resolve(baseDir);
	const file = resolve(base, path);
	if (!file.startsWith(base + sep)) throw new MediaPathOutsideError(path);
	return file;
}
