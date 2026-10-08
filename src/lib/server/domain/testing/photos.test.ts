import { describe, expect, it } from 'bun:test';
import { inMemoryGalleryPhotos, photoRepositoryWith, someGalleryPhoto } from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('someGalleryPhoto', () => {
	it('is a shared gallery photo of one person, undated, unpinned and not worn', () => {
		expect(someGalleryPhoto('p1')).toEqual({
			id: 'p1',
			contactId: 'c1',
			caption: null,
			visibility: 'shared',
			createdBy: 'u1',
			width: 1600,
			height: 1200,
			takenAt: null,
			createdAt: 1000,
			isAvatar: false,
			framing: null,
			pinnedAt: null,
			cutFrom: null
		});
	});

	it('takes the fields a test is about', () => {
		const pinned = someGalleryPhoto('p2', { contactId: 'c2', pinnedAt: 5 });
		expect([pinned.contactId, pinned.pinnedAt]).toEqual(['c2', 5]);
	});
});

describe('inMemoryGalleryPhotos', () => {
	const gallery = inMemoryGalleryPhotos([
		someGalleryPhoto('old', { createdAt: 1 }),
		someGalleryPhoto('elsewhere', { contactId: 'c2', createdAt: 2 }),
		someGalleryPhoto('new', { createdAt: 3 })
	]);

	it('lists one person’s photos, newest added first', async () => {
		expect((await gallery.listGalleryPhotos(viewer, 'c1')).map((p) => p.id)).toEqual([
			'new',
			'old'
		]);
	});

	it('finds a photo only on the person it belongs to', async () => {
		expect((await gallery.findVisibleGalleryPhoto(viewer, 'c1', 'old'))?.id).toBe('old');
		expect(await gallery.findVisibleGalleryPhoto(viewer, 'c1', 'elsewhere')).toBeNull();
		expect(await gallery.findVisibleGalleryPhoto(viewer, 'c1', 'missing')).toBeNull();
	});
});

describe('photoRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const repo = photoRepositoryWith({ exists: async () => true });
		expect(await repo.exists('p1')).toBe(true);
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = photoRepositoryWith({});
		await expect(repo.setContactAvatar('c1', 'p1')).rejects.toThrow(
			'PhotoRepository.setContactAvatar was not expected in this test'
		);
	});
});
