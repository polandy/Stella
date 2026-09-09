import { TranslatableError } from '$lib/errors/translatable';
import { phrase, type Phrase } from '$lib/i18n/phrase';
/*
 * A minimal ustar (POSIX tar) writer and reader for the household archive (docs/02 §2.15).
 *
 * Hand-written rather than pulled in: the format is one 512-byte header per file and the
 * project prefers a Bun/Web API or a few lines of its own over a dependency (docs/08 §8.8).
 * Only what an archive needs is here — regular files, no symlinks, no long names. Writing is a
 * pure function over bytes, so the export route can stream entry after entry without ever
 * holding the whole archive; reading takes the uploaded bytes apart in one go.
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
const NAME_WIDTH = 100;
const SIZE_OFFSET = 124;
const SIZE_WIDTH = 12;
const TYPEFLAG_OFFSET = 156;

/**
 * The header's own checksum: the sum of its bytes with the checksum field itself read as
 * spaces. Both directions use it — the writer stores it, the reader holds the header against
 * it — so it lives here once.
 */
function checksumOf(block: Uint8Array): number {
	let sum = 0;
	for (let at = 0; at < TAR_BLOCK; at++) {
		const inField = at >= CHECKSUM_OFFSET && at < CHECKSUM_OFFSET + CHECKSUM_WIDTH;
		sum += inField ? 0x20 : block[at];
	}
	return sum;
}

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

	// Six octal digits, a NUL and a space — the layout every reader accepts.
	writeText(block, CHECKSUM_OFFSET, checksumOf(block).toString(8).padStart(6, '0') + '\0 ');
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

// ── Reading ──────────────────────────────────────────────────────────────

/** One file taken out of an archive. */
export interface TarEntry {
	name: string;
	bytes: Uint8Array;
}

/** Bytes that are not an archive this reader can take apart. */
export class TarFormatError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'TarFormatError');
	}
}

const decoder = new TextDecoder();

/** A NUL-terminated string field. */
function readText(block: Uint8Array, offset: number, width: number): string {
	const field = block.subarray(offset, offset + width);
	const end = field.indexOf(0);
	return decoder.decode(end === -1 ? field : field.subarray(0, end));
}

/** An octal number field, however the writer padded it. */
function readOctal(block: Uint8Array, offset: number, width: number): number {
	const raw = readText(block, offset, width).trim();
	const value = raw.length === 0 ? 0 : Number.parseInt(raw, 8);
	if (!Number.isFinite(value) || value < 0) {
		throw new TarFormatError(phrase('archive.error.badHeaderField'));
	}
	return value;
}

/** Whether a block is all zeroes — two of them in a row end the archive. */
function isZeroBlock(block: Uint8Array): boolean {
	return block.every((byte) => byte === 0);
}

/** Regular file; the NUL form is what older writers use for the same thing. */
const REGULAR_TYPEFLAGS = ['0', '\0'];
const DIRECTORY_TYPEFLAG = '5';

/**
 * The files in an archive, in the order they were written.
 *
 * Deliberately strict about what it accepts and lenient about what an ordinary `tar` adds:
 * every header is held against its own checksum and an archive that stops mid-file is refused
 * — a restore reading half a photo, or a header it guessed at, is worse than one that fails —
 * while directory entries and the `./` prefixes `tar` writes when a folder is repacked are
 * accepted, because the household may well hand back an archive it unpacked and packed again.
 * Anything else (long-name and pax extensions, symlinks) is refused rather than skipped: those
 * entries change the meaning of the entry after them, so skipping one corrupts a name silently.
 */
export function readTar(archive: Uint8Array): TarEntry[] {
	if (archive.length < TAR_BLOCK) throw new TarFormatError(phrase('archive.error.notATar'));

	const entries: TarEntry[] = [];
	let at = 0;

	while (at + TAR_BLOCK <= archive.length) {
		const header = archive.subarray(at, at + TAR_BLOCK);
		if (isZeroBlock(header)) break;

		if (readOctal(header, CHECKSUM_OFFSET, CHECKSUM_WIDTH) !== checksumOf(header)) {
			throw new TarFormatError(phrase('archive.error.damaged'));
		}

		const name = readText(header, 0, NAME_WIDTH).replace(/^\.\//, '');
		const size = readOctal(header, SIZE_OFFSET, SIZE_WIDTH);
		const typeflag = String.fromCharCode(header[TYPEFLAG_OFFSET]);
		at += TAR_BLOCK;

		if (at + size > archive.length) {
			throw new TarFormatError(phrase('archive.error.truncated', { name }));
		}

		if (REGULAR_TYPEFLAGS.includes(typeflag)) {
			// Sliced to the size field, not to the block boundary: the padding after a file is
			// not part of it.
			entries.push({ name, bytes: archive.slice(at, at + size) });
		} else if (typeflag !== DIRECTORY_TYPEFLAG) {
			throw new TarFormatError(phrase('archive.error.unsupportedEntry', { name, typeflag }));
		}

		at += size + paddingFor(size);
	}

	return entries;
}
