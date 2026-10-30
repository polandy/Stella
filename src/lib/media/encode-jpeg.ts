import { DataUrlError, decodeDataUrl } from './data-url';

/*
 * Encoding a drawn canvas as JPEG, for every picture the browser prepares for upload
 * (`./process-image`, `./process-avatar`).
 *
 * Synchronously, through `toDataURL`, on purpose: Chromium runs `toBlob` (and OffscreenCanvas's
 * `convertToBlob`) as an idle task. It starts only once the page is idle or after a full second,
 * and if idle time then runs out it is forced to finish only after several more — so on a busy
 * page every save waited a second, and now and then more than five, which is what made the
 * *Use as photo* e2e flaky. The data URL costs a base64 round trip on a picture of at most
 * a few megabytes, and never waits on anything.
 */

const JPEG = 'image/jpeg';

/** The JPEG a canvas's `toDataURL('image/jpeg')` returned, as a Blob; fails loud on anything else. */
export function jpegFromDataUrl(dataUrl: string): Blob {
	// An empty canvas answers `data:,`, which `decodeDataUrl` refuses on its own.
	const { bytes, mime } = decodeDataUrl(dataUrl);
	// A browser that cannot write JPEG silently writes PNG instead.
	if (mime !== JPEG) throw new DataUrlError(`The canvas was encoded as ${mime}, not as JPEG.`);
	return new Blob([bytes], { type: JPEG });
}

/** The canvas as a JPEG at `quality` (0–1). Browser-only. */
export function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Blob {
	return jpegFromDataUrl(canvas.toDataURL(JPEG, quality));
}
