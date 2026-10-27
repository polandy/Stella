import { describe, expect, it } from 'bun:test';
import { cardPicture, imageSize, pictureOfFile, storablePicture } from './card-photo';

/** A JPEG's header up to its frame: SOI, an APP0 segment, then SOF0 with height and width. */
// prettier-ignore
const jpeg = (width: number, height: number) =>
	new Uint8Array([
		0xff, 0xd8,
		0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
		0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
		0x00, 0x00, 0x00
	]);

/** A PNG's signature and IHDR, which says its width and height. */
// prettier-ignore
const png = (width: number, height: number) =>
	new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0, 0, width >> 8, width & 0xff, 0, 0, height >> 8, height & 0xff
	]);

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

describe('a card’s picture', () => {
	it('is read from a vCard 3 line or a data URI, its wrapping gone', () => {
		const data = b64(jpeg(10, 20));
		const v3 = `BEGIN:VCARD\r\nVERSION:3.0\r\nPHOTO;ENCODING=b;TYPE=JPEG:${data.slice(0, 10)}\r\n ${data.slice(10)}\r\nEND:VCARD\r\n`;
		expect(cardPicture(v3)).toEqual({ mime: 'image/jpeg', base64: data });

		const v4 = `BEGIN:VCARD\r\nVERSION:4.0\r\nPHOTO:data:image/png;base64\\,${b64(png(1, 1))}\r\nEND:VCARD\r\n`;
		expect(cardPicture(v4)).toEqual({ mime: 'image/png', base64: b64(png(1, 1)) });
	});

	it('is none when the card only links to one', () => {
		const card =
			'BEGIN:VCARD\r\nVERSION:3.0\r\nPHOTO;VALUE=uri:https://example.com/a.jpg\r\nEND:VCARD\r\n';
		expect(cardPicture(card)).toBeNull();
	});
});

describe('an image’s size', () => {
	it('reads from a JPEG’s frame and a PNG’s header', () => {
		expect(imageSize(jpeg(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 });
		expect(imageSize(png(300, 200), 'image/png')).toEqual({ width: 300, height: 200 });
	});

	it('is unknown for a header that does not read', () => {
		expect(imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), 'image/jpeg')).toBeNull();
		expect(imageSize(new Uint8Array(12), 'image/webp')).toBeNull();
	});
});

describe('a storable picture', () => {
	it('is a known image whose size reads', () => {
		expect(storablePicture({ mime: 'image/jpeg', base64: b64(jpeg(64, 64)) })).toMatchObject({
			mime: 'image/jpeg',
			width: 64,
			height: 64
		});
	});

	it('is not one when Stella cannot tell what or how big it is', () => {
		expect(
			storablePicture({ mime: 'image/jpeg', base64: b64(new Uint8Array([1, 2, 3])) })
		).toBeNull();
		expect(storablePicture({ mime: 'image/jpeg', base64: '' })).toBeNull();
		const huge = new Uint8Array(500_000);
		huge.set(jpeg(64, 64));
		expect(storablePicture({ mime: 'image/jpeg', base64: b64(huge) })).toBeNull();
	});

	it('goes back out as the same picture', () => {
		const bytes = jpeg(8, 8);
		expect(pictureOfFile(bytes, 'image/jpeg')).toEqual({ mime: 'image/jpeg', base64: b64(bytes) });
	});
});
