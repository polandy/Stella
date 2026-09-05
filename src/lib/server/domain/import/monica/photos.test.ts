import { describe, expect, it } from 'bun:test';
import type { MediaStore, PhotoRepository, StoredPhoto } from '../../media/avatars';
import { InvalidImageError } from '../../media/journal-photos';
import { attachImportedPhoto } from './photos';

/*
 * Imported photos (docs/02 §2.16): the bytes arrive browser-resized like every other upload,
 * are validated the same way, stored once under the plan's stable photo id, and become the
 * contact's avatar when Monica used them as one. Attaching the same photo twice is a no-op.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const NOW = 1_700_000_000_000;

function fakes() {
	const stored: StoredPhoto[] = [];
	const avatars: { contactId: string; photoId: string }[] = [];
	const files = new Map<string, Uint8Array>();
	const photos: PhotoRepository = {
		insert: async (p) => {
			stored.push(p);
		},
		exists: async (id) => stored.some((p) => p.id === id),
		setContactAvatar: async (contactId, photoId) => {
			avatars.push({ contactId, photoId });
		},
		getVisiblePhotoFile: async () => null,
		listJournalPhotos: async () => [],
		listGalleryPhotos: async () => [],
		findVisibleGalleryPhoto: async () => null,
		updateOwnGalleryPhoto: async () => false,
		deleteOwnGalleryPhoto: async () => null
	};
	const media: MediaStore = {
		put: async (key, bytes) => {
			files.set(key, bytes);
			return key;
		},
		read: async (path) => files.get(path) ?? null,
		delete: async (path) => {
			files.delete(path);
		}
	};
	return { photos, media, stored, avatars, files, deps: { photos, media, clock: { now: () => NOW } } };
}

const input = (over: Partial<Parameters<typeof attachImportedPhoto>[1]> = {}) => ({
	photoId: 'monica:photo:10',
	contactId: 'monica:contact:1',
	householdId: 'h1',
	userId: 'u1',
	visibility: 'shared' as const,
	isAvatar: false,
	upload: { image: JPEG, thumb: JPEG, width: 800, height: 600 },
	...over
});

describe('attachImportedPhoto', () => {
	it('stores the files under the stable id and records the photo on the contact', async () => {
		const f = fakes();
		expect(await attachImportedPhoto(f.deps, input())).toBe('stored');
		expect([...f.files.keys()]).toEqual(['monica:photo:10.jpg', 'monica:photo:10_thumb.jpg']);
		expect(f.stored[0]).toMatchObject({
			id: 'monica:photo:10',
			contactId: 'monica:contact:1',
			householdId: 'h1',
			createdBy: 'u1',
			visibility: 'shared',
			journalEntryId: null,
			mime: 'image/jpeg',
			width: 800,
			height: 600,
			createdAt: NOW
		});
		expect(f.avatars).toEqual([]);
	});

	it('makes the photo the avatar when Monica used it as one', async () => {
		const f = fakes();
		await attachImportedPhoto(f.deps, input({ isAvatar: true }));
		expect(f.avatars).toEqual([{ contactId: 'monica:contact:1', photoId: 'monica:photo:10' }]);
	});

	it('does nothing the second time the same photo arrives', async () => {
		const f = fakes();
		await attachImportedPhoto(f.deps, input({ isAvatar: true }));
		expect(await attachImportedPhoto(f.deps, input({ isAvatar: true }))).toBe('already');
		expect(f.stored).toHaveLength(1);
		expect(f.avatars).toHaveLength(1);
	});

	it('refuses bytes that are not an image, writing nothing', async () => {
		const f = fakes();
		await expect(
			attachImportedPhoto(f.deps, input({ upload: { image: new Uint8Array([1, 2, 3]), thumb: JPEG, width: 1, height: 1 } }))
		).rejects.toBeInstanceOf(InvalidImageError);
		expect(f.files.size).toBe(0);
		expect(f.stored).toHaveLength(0);
	});
});
