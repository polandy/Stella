import { describe, expect, it } from 'bun:test';
import { MAX_SHARED_PHOTOS } from '$lib/share/shared';
import { shareFrom } from './share-store';

function photo(name: string, type = 'image/jpeg'): File {
	return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('a share as the phone posts it', () => {
	it('carries its words and its photos', () => {
		const form = new FormData();
		form.set('title', 'Lego');
		form.set('text', 'https://shop.example/lego');
		form.append('files', photo('a.jpg'));

		const share = shareFrom(form, 'id-1', 1000);

		expect(share).toMatchObject({
			id: 'id-1',
			title: 'Lego',
			text: 'https://shop.example/lego',
			url: ''
		});
		expect(share.photos.map((p) => p.name)).toEqual(['a.jpg']);
		expect(share.photoCount).toBe(1);
		expect(share.savedAt).toBe(1000);
	});

	it(`keeps no more than ${MAX_SHARED_PHOTOS} photos, and counts every one that came`, () => {
		const form = new FormData();
		for (let i = 0; i < 12; i++) form.append('files', photo(`${i}.jpg`));

		const share = shareFrom(form, 'id', 0);

		expect(share.photos).toHaveLength(MAX_SHARED_PHOTOS);
		expect(share.photoCount).toBe(12);
	});

	it('takes only images, whatever else an app sends along', () => {
		const form = new FormData();
		form.append('files', photo('notes.pdf', 'application/pdf'));

		expect(shareFrom(form, 'id', 0).photos).toEqual([]);
	});
});
