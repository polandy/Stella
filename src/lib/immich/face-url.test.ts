import { describe, expect, it } from 'bun:test';
import { immichFaceUrl } from './face-url';

describe('immichFaceUrl', () => {
	it('points at Stella’s own route for a face, never at Immich', () => {
		expect(immichFaceUrl('0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70')).toBe(
			'/media/immich/people/0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70/thumbnail'
		);
	});

	it('escapes the id, so it stays one path segment', () => {
		expect(immichFaceUrl('../x')).toBe('/media/immich/people/..%2Fx/thumbnail');
	});
});
