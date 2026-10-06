import { describe, expect, it } from 'bun:test';
import { withPage, type GlimpsePhoto } from './strip';

const photo = (id: string): GlimpsePhoto => ({
	id,
	takenOn: '2026-08-14',
	thumbnailUrl: `/media/immich/${id}-t`,
	previewUrl: `/media/immich/${id}-p`,
	openUrl: `https://immich.example.com/photos/${id}`
});

describe('withPage', () => {
	it('adds the next page after the photos already shown, in its order', () => {
		expect(withPage([photo('a'), photo('b')], [photo('c'), photo('d')]).map((p) => p.id)).toEqual([
			'a',
			'b',
			'c',
			'd'
		]);
	});

	it('skips a photo already shown, which a photo added in Immich meanwhile can push onto the next page', () => {
		expect(withPage([photo('a'), photo('b')], [photo('b'), photo('c')]).map((p) => p.id)).toEqual([
			'a',
			'b',
			'c'
		]);
	});

	it('leaves the shown strip as it was', () => {
		const shown = [photo('a')];
		withPage(shown, [photo('b')]);
		expect(shown.map((p) => p.id)).toEqual(['a']);
	});
});
