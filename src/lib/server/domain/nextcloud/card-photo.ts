import type { CardPicture } from './card-out';
import { sniffImageMime, THUMB_MAX_BYTES, type ImageMime } from '../media/avatars';
import { readPhoto, splitCards } from '../import/vcard-lines';

/*
 * A card's picture as Stella can store it (docs/02 §2.16.3). Every other picture reaches the
 * server already downscaled by the browser (docs/04: no image library on the server); a sync has
 * no browser, so it takes a card's picture as it is — which a phone keeps small — and only when
 * its size reads from its header and it fits as its own thumbnail. Anything else stays on the
 * card. Pure.
 */

/** A card's picture, decoded and checked: what `setContactAvatar` takes, image and thumb in one. */
export interface StorablePicture {
	bytes: Uint8Array;
	mime: ImageMime;
	width: number;
	height: number;
}

/** The first inline picture of one vCard, as the card carries it; null when it has none. */
export function cardPicture(vcard: string): CardPicture | null {
	const [card] = splitCards(vcard);
	for (const property of card?.filter((p) => p.name === 'PHOTO') ?? []) {
		const photo = readPhoto(property, 'photo', 'card');
		if (!photo?.dataUrl) continue;
		const base64 = photo.dataUrl.slice(photo.dataUrl.indexOf(',') + 1).replace(/\s/g, '');
		return { mime: photo.mime, base64 };
	}
	return null;
}

const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32be = (b: Uint8Array, at: number) => u16be(b, at) * 65536 + u16be(b, at + 2);

/** Start-of-frame markers, the ones that carry a JPEG's size (not DHT, JPG or DAC). */
const isStartOfFrame = (marker: number) =>
	marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** A JPEG's or PNG's size from its header; null for anything else or a header that does not read. */
export function imageSize(
	bytes: Uint8Array,
	mime: ImageMime
): { width: number; height: number } | null {
	if (mime === 'image/png') {
		// The signature, then IHDR's length and name, then width and height.
		if (bytes.length < 24) return null;
		return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
	}
	if (mime !== 'image/jpeg') return null;
	let at = 2;
	while (at + 9 <= bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1]!;
		if (marker === 0xff) {
			at += 1; // fill byte
			continue;
		}
		if (isStartOfFrame(marker)) {
			return { width: u16be(bytes, at + 7), height: u16be(bytes, at + 5) };
		}
		at += 2 + u16be(bytes, at + 2);
	}
	return null;
}

/** The picture decoded and ready to store, or null when Stella should leave it on the card. */
export function storablePicture(picture: CardPicture): StorablePicture | null {
	const bytes = new Uint8Array(Buffer.from(picture.base64, 'base64'));
	if (bytes.byteLength === 0 || bytes.byteLength > THUMB_MAX_BYTES) return null;
	const mime = sniffImageMime(bytes);
	if (!mime) return null;
	const size = imageSize(bytes, mime);
	if (!size || size.width <= 0 || size.height <= 0) return null;
	return { bytes, mime, ...size };
}

/** A stored picture as a card carries it. */
export const pictureOfFile = (bytes: Uint8Array, mime: string): CardPicture => ({
	mime,
	base64: Buffer.from(bytes).toString('base64')
});
