import { phrase } from '../../i18n/phrase';
import { SqlDumpError } from '../domain/import/monica/sql-dump';
import { BodyTooLargeError, readCapped } from '../http/read-capped';

/*
 * The uploaded export as text (docs/02 §2.16), whether it arrived plain or gzipped. A gzip is
 * inflated as a stream and refused once it passes the cap, so a few megabytes on the wire
 * cannot expand into gigabytes in memory before the size is known.
 */

const GZIP_MAGIC = [0x1f, 0x8b];

export async function dumpTextOf(file: Blob, maxBytes: number): Promise<string> {
	const tooLarge = () => new SqlDumpError(phrase('import.error.tooLarge'));
	if (file.size > maxBytes) throw tooLarge();

	const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	const gzipped = head[0] === GZIP_MAGIC[0] && head[1] === GZIP_MAGIC[1];
	const body = gzipped ? file.stream().pipeThrough(new DecompressionStream('gzip')) : file.stream();
	try {
		return new TextDecoder().decode(await readCapped(new Response(body), maxBytes));
	} catch (err) {
		if (err instanceof BodyTooLargeError) throw tooLarge();
		throw err;
	}
}
