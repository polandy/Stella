import { describe, expect, test } from 'bun:test';
import { readExifCaptureDate } from './exif-date';

/*
 * The capture date read out of a picture before the browser re-encodes it (docs/02 §2.14).
 * Three files were written by real tools (ImageMagick + exiftool): a camera-like JPEG in
 * Motorola byte order with a JFIF segment ahead of its EXIF, one in Intel order carrying only
 * the digitised date, and one with no EXIF at all. The edge cases are built byte by byte.
 */

const fixture = async (name: string) =>
	new Uint8Array(await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).arrayBuffer());

type Order = 'II' | 'MM';
interface Tag {
	tag: number;
	value: string;
}

/** A JPEG holding one APP1 EXIF segment with `exifTags` in its Exif IFD (and nothing else). */
function jpegWithExif(exifTags: Tag[], order: Order = 'II'): Uint8Array {
	const little = order === 'II';
	const tiff: number[] = [];
	const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
	const u32 = (n: number) =>
		little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
	// Header, then IFD0 at 8 with one entry: the pointer to the Exif IFD right after it.
	const ifd0At = 8;
	const exifIfdAt = ifd0At + 2 + 12 + 4;
	const dataAt = exifIfdAt + 2 + exifTags.length * 12 + 4;
	tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At));
	tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdAt), ...u32(0));
	const data: number[] = [];
	tiff.push(...u16(exifTags.length));
	for (const { tag, value } of exifTags) {
		const bytes = [...new TextEncoder().encode(value), 0];
		if (bytes.length <= 4) {
			tiff.push(...u16(tag), ...u16(2), ...u32(bytes.length), ...bytes, ...new Array(4 - bytes.length).fill(0));
		} else {
			tiff.push(...u16(tag), ...u16(2), ...u32(bytes.length), ...u32(dataAt + data.length));
			data.push(...bytes);
		}
	}
	tiff.push(...u32(0), ...data);
	const payload = [...new TextEncoder().encode('Exif'), 0, 0, ...tiff];
	const length = payload.length + 2;
	return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...payload, 0xff, 0xd9]);
}

const ORIGINAL = 0x9003;
const DIGITIZED = 0x9004;
const OFFSET_ORIGINAL = 0x9011;
const OFFSET_DIGITIZED = 0x9012;

describe('readExifCaptureDate', () => {
	test('reads DateTimeOriginal with its offset from a camera-like file', async () => {
		expect(readExifCaptureDate(await fixture('camera.jpg'))).toBe('2019-05-03T00:30:15+02:00');
	});

	test('falls back to the digitised date when the original is missing (Intel byte order)', async () => {
		expect(readExifCaptureDate(await fixture('digitized-only.jpg'))).toBe('2008-11-23T17:45:02');
	});

	test('a JPEG without EXIF has no date', async () => {
		expect(readExifCaptureDate(await fixture('no-exif.jpg'))).toBeNull();
	});

	test('reads both byte orders', () => {
		for (const order of ['II', 'MM'] as const) {
			expect(readExifCaptureDate(jpegWithExif([{ tag: ORIGINAL, value: '2021:12:31 23:59:58' }], order))).toBe(
				'2021-12-31T23:59:58'
			);
		}
	});

	test('the original wins over the digitised date, each with its own offset', () => {
		const tags = [
			{ tag: ORIGINAL, value: '2020:01:02 03:04:05' },
			{ tag: DIGITIZED, value: '2022:02:02 02:02:02' },
			{ tag: OFFSET_ORIGINAL, value: '-05:00' },
			{ tag: OFFSET_DIGITIZED, value: '+09:00' }
		];
		expect(readExifCaptureDate(jpegWithExif(tags))).toBe('2020-01-02T03:04:05-05:00');
		expect(readExifCaptureDate(jpegWithExif(tags.filter((t) => t.tag !== ORIGINAL)))).toBe(
			'2022-02-02T02:02:02+09:00'
		);
	});

	test('a malformed offset is left off rather than costing the date', () => {
		const tags = [
			{ tag: ORIGINAL, value: '2020:01:02 03:04:05' },
			{ tag: OFFSET_ORIGINAL, value: '   :  ' }
		];
		expect(readExifCaptureDate(jpegWithExif(tags))).toBe('2020-01-02T03:04:05');
	});

	test('a blank or impossible date is no date', () => {
		for (const value of ['0000:00:00 00:00:00', '    :  :     :  :  ', '2021:02:30 10:00:00', '2021:13:01 10:00:00', '2021-05-01']) {
			expect(readExifCaptureDate(jpegWithExif([{ tag: ORIGINAL, value }]))).toBeNull();
		}
	});

	test('an impossible original falls back to the digitised date', () => {
		const tags = [
			{ tag: ORIGINAL, value: '0000:00:00 00:00:00' },
			{ tag: DIGITIZED, value: '2018:07:01 08:09:10' }
		];
		expect(readExifCaptureDate(jpegWithExif(tags))).toBe('2018-07-01T08:09:10');
	});

	test('anything that is not a JPEG has no date', () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
		expect(readExifCaptureDate(png)).toBeNull();
		expect(readExifCaptureDate(new Uint8Array())).toBeNull();
	});

	test('a truncated or lying file never throws, it just has no date', () => {
		const whole = jpegWithExif([{ tag: ORIGINAL, value: '2021:12:31 23:59:58' }]);
		for (let cut = 0; cut < whole.length - 2; cut++) {
			expect(() => readExifCaptureDate(whole.subarray(0, cut))).not.toThrow();
		}
		// The value's offset points far past the end of the segment.
		const lying = whole.slice();
		const valueOffsetAt = 4 + 2 + 6 + 8 + 18 + 2 + 8;
		lying.set([0xff, 0xff, 0x00, 0x00], valueOffsetAt);
		expect(readExifCaptureDate(lying)).toBeNull();
		// IFD0 said to start far past the end of the segment.
		const lost = whole.slice();
		lost.set([0xff, 0xff, 0x00, 0x00], 4 + 2 + 6 + 4);
		expect(readExifCaptureDate(lost)).toBeNull();
	});
});
