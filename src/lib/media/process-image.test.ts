import { describe, expect, test } from 'bun:test';
import { readCaptureDate } from './process-image';

/*
 * `readCaptureDate` is the glue between the pure EXIF reader (`./exif-date`, tested against real
 * camera files) and the plausibility check (`./taken-at`, tested on its own): it reads only the
 * file's head and drops a date `isPlausibleTakenAt` would refuse, so an upload never fails over
 * it. The reader and the threshold each have their own exhaustive tests; this only checks the
 * wiring between them, against the same fixtures `exif-date.test.ts` uses.
 */

const fixture = async (name: string) =>
	new Blob([await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).arrayBuffer()]);

describe('readCaptureDate', () => {
	test('reads the capture date out of a camera file', async () => {
		expect(await readCaptureDate(await fixture('camera.jpg'))).toBe('2019-05-03T00:30:15+02:00');
	});

	test('a file with no EXIF has no capture date', async () => {
		expect(await readCaptureDate(await fixture('no-exif.jpg'))).toBeNull();
	});
});
