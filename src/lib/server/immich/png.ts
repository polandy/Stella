/*
 * A one-colour PNG, built by hand: the stand-in Immich (`fake-gateway.ts`) needs faces to show,
 * and a fixture file per demo person would be a binary blob in the repository for a tile that
 * is only ever a colour. Bun's deflate and CRC32 do the work; nothing here is a dependency.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Bit depth 8, colour type 2 (truecolour RGB), default compression, filter and interlace. */
const RGB_8_BIT = [8, 2, 0, 0, 0];

function uint32(value: number): number[] {
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: Uint8Array): number[] {
	const typed = new Uint8Array([...new TextEncoder().encode(type), ...data]);
	return [...uint32(data.length), ...typed, ...uint32(Bun.hash.crc32(typed))];
}

/** A `size`×`size` PNG filled with one colour, given as `#rrggbb`. */
export function solidPng(size: number, hex: string): Uint8Array<ArrayBuffer> {
	const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
	// Each scanline starts with its filter byte (0, none), then one RGB triple per pixel.
	const row = [0, ...Array.from({ length: size }, () => [r, g, b]).flat()];
	const pixels = new Uint8Array(Array.from({ length: size }, () => row).flat());
	return new Uint8Array([
		...SIGNATURE,
		...chunk('IHDR', new Uint8Array([...uint32(size), ...uint32(size), ...RGB_8_BIT])),
		...chunk('IDAT', zlib(pixels)),
		...chunk('IEND', new Uint8Array())
	]);
}

/** PNG wants a zlib stream (header + deflate + Adler-32), not raw deflate. */
function zlib(data: Uint8Array<ArrayBuffer>): Uint8Array {
	let a = 1;
	let b = 0;
	for (const byte of data) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	}
	return new Uint8Array([0x78, 0x9c, ...Bun.deflateSync(data), ...uint32(((b << 16) | a) >>> 0)]);
}
