import { describe, expect, it } from 'bun:test';
import type { PhotoRepository, StoredPhoto } from './avatars';
import { addGalleryPhoto, type GalleryUploadDeps } from './gallery-upload';
import { InvalidImageError } from './journal-photos';

/*
 * Adding a photo to a person's gallery (docs/02 §2.14). Same browser-processed bytes as a
 * journal photo, but the photo stands on its own: no entry, and its own visibility.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);
const upload = { image: JPEG, thumb: JPEG, width: 1600, height: 1200 };

function deps() {
	const stored: StoredPhoto[] = [];
	const puts: string[] = [];
	const photos: Partial<PhotoRepository> = {
		async insert(p) {
			stored.push(p);
		}
	};
	const d: GalleryUploadDeps & { stored: StoredPhoto[]; puts: string[] } = {
		stored,
		puts,
		photos: photos as PhotoRepository,
		media: {
			async put(key, bytes) {
				puts.push(`${key}:${bytes.byteLength}`);
				return `/media/${key}`;
			},
			async read() {
				return null;
			},
			async delete() {}
		},
		ids: (() => {
			let n = 0;
			return { next: () => `g-${++n}` };
		})(),
		clock: { now: () => 7000 }
	};
	return d;
}

describe('addGalleryPhoto', () => {
	it('stores both variants and records a gallery photo — no journal entry', async () => {
		const d = deps();
		const id = await addGalleryPhoto(
			d,
			{ userId: 'u1', householdId: 'h1' },
			{ contactId: 'c1', visibility: 'shared', upload }
		);
		expect(id).toBe('g-1');
		expect(d.puts).toEqual(['g-1.jpg:6', 'g-1_thumb.jpg:6']);
		expect(d.stored[0]).toMatchObject({
			id: 'g-1',
			householdId: 'h1',
			contactId: 'c1',
			journalEntryId: null,
			createdBy: 'u1',
			visibility: 'shared',
			filePath: '/media/g-1.jpg',
			thumbPath: '/media/g-1_thumb.jpg',
			mime: 'image/jpeg',
			width: 1600,
			height: 1200,
			createdAt: 7000
		});
	});

	it('keeps a private photo private', async () => {
		const d = deps();
		await addGalleryPhoto(d, { userId: 'u1', householdId: 'h1' }, {
			contactId: 'c1',
			visibility: 'private',
			upload
		});
		expect(d.stored[0]?.visibility).toBe('private');
	});

	it('stores nothing when the bytes are not a real image', async () => {
		const d = deps();
		await expect(
			addGalleryPhoto(d, { userId: 'u1', householdId: 'h1' }, {
				contactId: 'c1',
				visibility: 'shared',
				upload: { ...upload, image: new Uint8Array([1, 2, 3, 4]), thumb: new Uint8Array([1, 2, 3, 4]) }
			})
		).rejects.toBeInstanceOf(InvalidImageError);
		expect(d.puts).toEqual([]);
		expect(d.stored).toEqual([]);
	});
});
