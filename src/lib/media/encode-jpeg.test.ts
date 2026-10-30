import { describe, expect, test } from 'bun:test';
import { DataUrlError } from './data-url';
import { jpegFromDataUrl } from './encode-jpeg';

/*
 * What a canvas's `toDataURL('image/jpeg')` hands back, as the Blob an upload sends. A browser
 * that cannot write JPEG answers PNG instead, and an empty canvas answers `data:,` — both must
 * fail loud rather than upload something that is not the JPEG the server expects.
 */

describe('jpegFromDataUrl', () => {
	test('turns a JPEG data URL into a JPEG Blob with its bytes', async () => {
		const blob = jpegFromDataUrl('data:image/jpeg;base64,/9j/4A==');

		expect(blob.type).toBe('image/jpeg');
		expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
	});

	test('refuses a browser that answered with PNG instead', () => {
		expect(() => jpegFromDataUrl('data:image/png;base64,iVBORw==')).toThrow(DataUrlError);
	});

	test('refuses the empty answer of a canvas with no pixels', () => {
		expect(() => jpegFromDataUrl('data:,')).toThrow(DataUrlError);
	});
});
