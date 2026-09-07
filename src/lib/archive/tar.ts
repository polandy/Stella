/*
 * A minimal ustar (POSIX tar) writer for the export archive (docs/02 §2.15).
 *
 * Hand-written rather than pulled in: the format is one 512-byte header per file and the
 * project prefers a Bun/Web API or a few lines of its own over a dependency (docs/08 §8.8).
 * Only what an export needs is here — regular files, no directories, no symlinks, no long
 * names. Everything is a pure function over bytes, so the route can stream entry after entry
 * without ever holding the whole archive.
 */

/** Every tar structure is a whole number of these. */
export const TAR_BLOCK = 512;

/** ustar keeps the file name in 100 bytes; nothing in an export comes near it. */
export const MAX_NAME_LENGTH = 100;

/** A name the format cannot carry. Thrown rather than truncated: a silently renamed file in a
 * backup is worse than a failed export. */
export class TarNameTooLongError extends Error {
	constructor(name: string) {
		super(`"${name}" is longer than the ${MAX_NAME_LENGTH} bytes a tar name can hold.`);
		this.name = 'TarNameTooLongError';
	}
}

const encoder = new TextEncoder();

/** Writes `text` at `offset`; the caller has already sized the field. */
function writeText(block: Uint8Array, offset: number, text: string): void {
	block.set(encoder.encode(text), offset);
}

/**
 * An octal field: `width - 1` digits, zero-padded, then the NUL terminator ustar expects.
 * Sizes and times are the only numbers an export writes, and both fit.
 */
function writeOctal(block: Uint8Array, offset: number, value: number, width: number): void {
	writeText(block, offset, value.toString(8).padStart(width - 1, '0'));
}

const CHECKSUM_OFFSET = 148;
const CHECKSUM_WIDTH = 8;

/** The 512-byte header for one regular file. */
export function tarHeader(name: string, size: number, mtimeSeconds: number): Uint8Array {
	const bytes = encoder.encode(name);
	if (bytes.length > MAX_NAME_LENGTH) throw new TarNameTooLongError(name);

	const block = new Uint8Array(TAR_BLOCK);
	block.set(bytes, 0);
	writeOctal(block, 100, 0o644, 8); // mode
	writeOctal(block, 108, 0, 8); // uid
	writeOctal(block, 116, 0, 8); // gid
	writeOctal(block, 124, size, 12);
	writeOctal(block, 136, Math.floor(mtimeSeconds), 12);
	// The checksum is computed with its own field read as spaces, so it must be spaces first.
	block.fill(0x20, CHECKSUM_OFFSET, CHECKSUM_OFFSET + CHECKSUM_WIDTH);
	writeText(block, 156, '0'); // typeflag: regular file
	writeText(block, 257, 'ustar\0');
	writeText(block, 263, '00');

	const sum = block.reduce((total, byte) => total + byte, 0);
	// Six octal digits, a NUL and a space — the layout every reader accepts.
	writeText(block, CHECKSUM_OFFSET, sum.toString(8).padStart(6, '0') + '\0 ');
	return block;
}

/** How many zero bytes follow `size` bytes of data to reach the next block boundary. */
export function paddingFor(size: number): number {
	return (TAR_BLOCK - (size % TAR_BLOCK)) % TAR_BLOCK;
}

/** One complete file in the archive: its header, its bytes, and the padding after them. */
export function tarEntry(name: string, bytes: Uint8Array, mtimeSeconds: number): Uint8Array {
	const padding = paddingFor(bytes.length);
	const out = new Uint8Array(TAR_BLOCK + bytes.length + padding);
	out.set(tarHeader(name, bytes.length, mtimeSeconds), 0);
	out.set(bytes, TAR_BLOCK);
	return out;
}

/** The two zero blocks that mark the end of an archive. */
export function tarTrailer(): Uint8Array {
	return new Uint8Array(TAR_BLOCK * 2);
}
