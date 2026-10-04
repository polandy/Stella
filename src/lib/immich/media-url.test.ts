import { describe, expect, it } from 'bun:test';
import { IMMICH_MEDIA_PATH, immichMediaUrl } from './media-url';

describe('immichMediaUrl', () => {
	it('points at Stella’s own signed proxy, never at Immich', () => {
		expect(immichMediaUrl('eyJrIjoicCJ9.c2ln')).toBe('/media/immich/eyJrIjoicCJ9.c2ln');
		expect(IMMICH_MEDIA_PATH).toBe('/media/immich');
	});

	it('escapes the token, so it stays one path segment', () => {
		expect(immichMediaUrl('../x')).toBe('/media/immich/..%2Fx');
	});
});
