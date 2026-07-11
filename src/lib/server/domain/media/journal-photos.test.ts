import { describe, expect, it } from 'bun:test';
import {
	attachJournalPhoto,
	InvalidImageError,
	type ImageUpload,
	type JournalPhotoDeps
} from './journal-photos';
import type { StoredPhoto } from './avatars';

/*
 * Journal photo domain (docs/02 §2.20 / §2.14). Images are downscaled + EXIF-stripped in the
 * browser; the server validates the bytes (magic-byte sniff + size) and stores them behind the
 * visibility model. A journal photo inherits the *entry's* visibility, so a private entry's
 * photos are private too. Pure use-case over storage/repository ports, tested with fakes.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x11, 0x22]);

function upload(over: Partial<ImageUpload> = {}): ImageUpload {
	return { image: JPEG, thumb: JPEG, width: 1600, height: 1200, ...over };
}

function deps() {
	const stored: StoredPhoto[] = [];
	const puts: string[] = [];
	const d: JournalPhotoDeps & { stored: StoredPhoto[]; puts: string[] } = {
		stored,
		puts,
		photos: {
			async insert(p: StoredPhoto) {
				stored.push(p);
			},
			async setContactAvatar() {},
			async getVisiblePhotoFile() {
				return null;
			},
			async listJournalPhotos() {
				return [];
			}
		},
		media: {
			async put(key: string, bytes: Uint8Array) {
				puts.push(key);
				return `/media-dir/${key}`;
			},
			async read() {
				return null;
			},
			async delete() {}
		},
		ids: (() => {
			let n = 0;
			return { next: () => `p-${++n}` };
		})(),
		clock: { now: () => 5000 }
	};
	return d;
}

describe('attachJournalPhoto', () => {
	it('stores full + thumb and records a photo linked to the entry, inheriting its visibility', async () => {
		const d = deps();
		const id = await attachJournalPhoto(
			d,
			{ userId: 'u1', householdId: 'h1' },
			{ contactId: 'c1', journalEntryId: 'j1', visibility: 'private', upload: upload() }
		);
		expect(id).toBe('p-1');
		expect(d.puts).toEqual(['p-1.jpg', 'p-1_thumb.jpg']);
		expect(d.stored).toHaveLength(1);
		expect(d.stored[0]).toMatchObject({
			id: 'p-1',
			householdId: 'h1',
			contactId: 'c1',
			journalEntryId: 'j1',
			createdBy: 'u1',
			visibility: 'private',
			filePath: '/media-dir/p-1.jpg',
			thumbPath: '/media-dir/p-1_thumb.jpg',
			mime: 'image/jpeg',
			width: 1600,
			height: 1200,
			createdAt: 5000
		});
	});

	it('rejects an empty image', async () => {
		const d = deps();
		await expect(
			attachJournalPhoto(d, { userId: 'u1', householdId: 'h1' }, {
				contactId: 'c1',
				journalEntryId: 'j1',
				visibility: 'shared',
				upload: upload({ image: new Uint8Array() })
			})
		).rejects.toBeInstanceOf(InvalidImageError);
	});

	it('rejects bytes that are not a real image', async () => {
		const d = deps();
		await expect(
			attachJournalPhoto(d, { userId: 'u1', householdId: 'h1' }, {
				contactId: 'c1',
				journalEntryId: 'j1',
				visibility: 'shared',
				upload: upload({ image: new Uint8Array([1, 2, 3, 4]), thumb: new Uint8Array([1, 2, 3, 4]) })
			})
		).rejects.toBeInstanceOf(InvalidImageError);
	});
});
