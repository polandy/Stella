import { isTakenAt } from './taken-at';

/*
 * The capture date out of a JPEG's EXIF (docs/02 §2.14), read before the browser re-encodes the
 * picture and so drops every tag. Only the date is taken: GPS and everything else are never read,
 * and are gone with the re-encode as before.
 *
 * A small reader instead of a library: a capture date is two tags in one IFD. It walks the JPEG's
 * segments to the APP1 `Exif` one, follows IFD0's pointer to the Exif IFD and reads
 * DateTimeOriginal (0x9003) with its OffsetTimeOriginal (0x9011). When the original is missing
 * or blank it takes DateTimeDigitized (0x9004, with 0x9012) — the same moment on a camera, and the
 * scan's on a scanned print, which still says more than the upload day. IFD0's DateTime (0x0132)
 * is not used: it is when the file was last changed, which an editor rewrites.
 *
 * Pure and total: a picture is whatever the member picked, so a file that is not a JPEG, has no
 * EXIF, is cut short or points outside itself has no date rather than throwing. HEIC and PNG carry
 * their metadata elsewhere and simply have none here.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_OFFSET_TIME_DIGITIZED = 0x9012;

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const IFD_ENTRY_BYTES = 12;

const MARKER_SOI = 0xd8;
const MARKER_SOS = 0xda;
const MARKER_EOI = 0xd9;
const MARKER_APP1 = 0xe1;

/** `Exif\0\0`, which opens an EXIF APP1 segment. */
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

/** The picture's capture date in the stored shape (`./taken-at`), or null when it carries none. */
export function readExifCaptureDate(head: Uint8Array): string | null {
	const tiff = exifSegment(head);
	if (!tiff) return null;
	const tags = exifIfdTags(tiff);
	if (!tags) return null;
	return (
		dateWithOffset(tags.get(TAG_DATE_TIME_ORIGINAL), tags.get(TAG_OFFSET_TIME_ORIGINAL)) ??
		dateWithOffset(tags.get(TAG_DATE_TIME_DIGITIZED), tags.get(TAG_OFFSET_TIME_DIGITIZED))
	);
}

/** The TIFF structure inside the first APP1 `Exif` segment, or null. */
function exifSegment(bytes: Uint8Array): Uint8Array | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== MARKER_SOI) return null;
	let at = 2;
	while (at + 4 <= bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1]!;
		// Fill bytes may pad between segments.
		if (marker === 0xff) {
			at += 1;
			continue;
		}
		if (marker === MARKER_SOS || marker === MARKER_EOI) return null;
		const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
		if (length < 2) return null;
		const start = at + 4;
		const end = at + 2 + length;
		if (end > bytes.length) return null;
		if (marker === MARKER_APP1 && EXIF_HEADER.every((b, i) => bytes[start + i] === b)) {
			return bytes.subarray(start + EXIF_HEADER.length, end);
		}
		at = end;
	}
	return null;
}

/** The ASCII tags of the Exif IFD, by tag number; null when the structure does not hold. */
function exifIfdTags(tiff: Uint8Array): Map<number, string> | null {
	if (tiff.length < 8) return null;
	const little = tiff[0] === 0x49 && tiff[1] === 0x49;
	const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
	if (!little && !big) return null;
	const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
	const u16 = (at: number) => view.getUint16(at, little);
	const u32 = (at: number) => view.getUint32(at, little);
	if (u16(2) !== 42) return null;

	const entries = (ifdAt: number): { tag: number; type: number; count: number; valueAt: number }[] | null => {
		if (ifdAt + 2 > tiff.length) return null;
		const count = u16(ifdAt);
		if (ifdAt + 2 + count * IFD_ENTRY_BYTES > tiff.length) return null;
		return Array.from({ length: count }, (_, i) => {
			const entryAt = ifdAt + 2 + i * IFD_ENTRY_BYTES;
			return { tag: u16(entryAt), type: u16(entryAt + 2), count: u32(entryAt + 4), valueAt: entryAt + 8 };
		});
	};

	const pointer = entries(u32(4))?.find((e) => e.tag === TAG_EXIF_IFD && e.type === TYPE_LONG);
	if (!pointer) return null;
	const exif = entries(u32(pointer.valueAt));
	if (!exif) return null;

	const tags = new Map<number, string>();
	for (const entry of exif) {
		if (entry.type !== TYPE_ASCII) continue;
		// Values of up to four bytes sit in the entry itself; longer ones are pointed at.
		const at = entry.count <= 4 ? entry.valueAt : u32(entry.valueAt);
		if (at + entry.count > tiff.length) continue;
		const text = String.fromCharCode(...tiff.subarray(at, at + entry.count));
		tags.set(entry.tag, text.replace(/\0[\s\S]*$/, ''));
	}
	return tags;
}

/** `YYYY:MM:DD HH:MM:SS` and an optional `±HH:MM` as a capture date, or null when not one. */
function dateWithOffset(dateTime: string | undefined, offset: string | undefined): string | null {
	const match = dateTime === undefined ? null : /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(dateTime);
	if (!match) return null;
	const local = `${match[1]}-${match[2]}-${match[3]}T${match[4]}`;
	if (!isTakenAt(local)) return null;
	// An offset that does not read is dropped; the wall-clock time still stands.
	return offset !== undefined && isTakenAt(`${local}${offset}`) ? `${local}${offset}` : local;
}
