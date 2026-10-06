import { describe, expect, it } from 'bun:test';
import { IMMICH_MEDIA_PATH, immichMediaToken, immichMediaUrl } from './media-url';

describe('immichMediaUrl', () => {
	it('points at Stella’s own signed proxy, never at Immich', () => {
		expect(immichMediaUrl('eyJrIjoicCJ9.c2ln')).toBe('/media/immich/eyJrIjoicCJ9.c2ln');
		expect(IMMICH_MEDIA_PATH).toBe('/media/immich');
	});

	it('escapes the token, so it stays one path segment', () => {
		expect(immichMediaUrl('../x')).toBe('/media/immich/..%2Fx');
	});
});

describe('immichMediaToken', () => {
	it('reads back the token a signed URL carries, so *Use as photo* can name the preview it cut from', () => {
		for (const token of ['eyJrIjoicCJ9.c2ln', '../x']) {
			expect(immichMediaToken(immichMediaUrl(token))).toBe(token);
		}
	});

	it('finds no token in a URL that is not the proxy’s', () => {
		for (const url of [
			'/media/photo-1',
			'/media/immich/',
			'/media/immich/a/b',
			'https://immich.example/media/immich/x',
			'/media/immich/%E0'
		]) {
			expect(immichMediaToken(url)).toBeNull();
		}
	});
});
