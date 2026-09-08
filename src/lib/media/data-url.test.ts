import { describe, expect, test } from 'bun:test';
import { decodeDataUrl, DataUrlError } from './data-url';

/* Reading a `data:` URL back into bytes — Monica's JSON export embeds pictures that way. */

describe('decodeDataUrl', () => {
	test('reads the media type and the bytes', () => {
		const decoded = decodeDataUrl('data:image/jpeg;base64,SGk=');

		expect(decoded.mime).toBe('image/jpeg');
		expect(new TextDecoder().decode(decoded.bytes)).toBe('Hi');
	});

	test('falls back to a plain byte stream when the URL names no type', () => {
		expect(decodeDataUrl('data:;base64,SGk=').mime).toBe('application/octet-stream');
	});

	test('refuses anything that is not a base64 data URL, rather than returning empty bytes', () => {
		expect(() => decodeDataUrl('https://example.test/a.jpg')).toThrow(DataUrlError);
		expect(() => decodeDataUrl('data:image/jpeg,not-base64')).toThrow(DataUrlError);
		expect(() => decodeDataUrl('')).toThrow(DataUrlError);
	});

	test('reads the media type out of a header that also carries parameters', () => {
		expect(decodeDataUrl('data:image/png;charset=binary;base64,SGk=').mime).toBe('image/png');
	});

	test('refuses a long header that never says base64, rather than working through it', () => {
		// The shape that would make a backtracking regular expression hang; it is a plain
		// rejection here, which is the point of parsing this by hand.
		expect(() => decodeDataUrl(`data:${';a'.repeat(5000)},payload`)).toThrow(DataUrlError);
	});

	test('refuses payload that is not valid base64', () => {
		expect(() => decodeDataUrl('data:image/jpeg;base64,####')).toThrow(DataUrlError);
	});
});
