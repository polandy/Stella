import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { AvatarUpload, GalleryPhoto, MediaStore } from './avatars';
import { InvalidAvatarError } from './avatars';
import { frameAsAvatar, type FramingDeps, type FramingRepository, type StoredFraming } from './framing';

/*
 * Wearing a gallery photo as the avatar through a chosen square (docs/02 §2.14). The photo stays
 * one photo: the square is remembered on a framing of it, and choosing again replaces that
 * framing rather than piling up copies. Tested over the ports with fakes.
 */

const viewer: Viewer = { id: 'u2', householdId: 'h1' };

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const upload: AvatarUpload = { image: JPEG, thumb: JPEG, width: 512, height: 512 };

const source = (over: Partial<GalleryPhoto> = {}): GalleryPhoto => ({
	id: 'p1',
	contactId: 'c1',
	caption: null,
	visibility: 'shared',
	createdBy: 'u1',
	width: 1600,
	height: 1200,
	createdAt: 1000,
	isAvatar: false,
	framing: null,
	pinnedAt: null,
	...over
});

function deps(visible: GalleryPhoto | null, replaced: { filePath: string; thumbPath: string }[] = []) {
	const stored: StoredFraming[] = [];
	const put: string[] = [];
	const deleted: string[] = [];
	const lookups: string[] = [];
	const framings: FramingRepository = {
		async findVisibleGalleryPhoto(v, contactId, photoId) {
			lookups.push(`${v.id} ${contactId} ${photoId}`);
			return visible;
		},
		async replaceFraming(framing) {
			stored.push(framing);
			return replaced;
		}
	};
	const media: MediaStore = {
		async put(key) {
			put.push(key);
			return `media/${key}`;
		},
		async read() {
			return null;
		},
		async delete(path) {
			deleted.push(path);
		}
	};
	const d: FramingDeps = { framings, media, ids: { next: () => 'f1' }, clock: { now: () => 5000 } };
	return { d, stored, put, deleted, lookups };
}

describe('framing a gallery photo as the avatar', () => {
	it('remembers the chosen square on a framing of that photo and wears it', async () => {
		const { d, stored, put } = deps(source());
		const crop = { x: 200, y: 100, size: 800 };

		expect(await frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop, upload })).toBe(true);

		expect(put).toEqual(['f1.jpg', 'f1_thumb.jpg']);
		expect(stored).toEqual([
			{
				id: 'f1',
				householdId: 'h1',
				contactId: 'c1',
				journalEntryId: null,
				framingOf: 'p1',
				crop,
				// A framing is seen by exactly who sees its photo, whoever chose the square.
				createdBy: 'u1',
				visibility: 'shared',
				filePath: 'media/f1.jpg',
				thumbPath: 'media/f1_thumb.jpg',
				mime: 'image/jpeg',
				width: 512,
				height: 512,
				sizeBytes: JPEG.byteLength,
				createdAt: 5000
			}
		]);
	});

	it('keeps a private photo private in its framing', async () => {
		const { d, stored } = deps(source({ visibility: 'private', createdBy: 'u2' }));
		await frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop: { x: 0, y: 0, size: 1200 }, upload });
		expect(stored[0]).toMatchObject({ visibility: 'private', createdBy: 'u2' });
	});

	it('deletes the files of the framing it replaces', async () => {
		const { d, deleted } = deps(source(), [{ filePath: 'media/old.jpg', thumbPath: 'media/old_thumb.jpg' }]);
		await frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop: { x: 0, y: 0, size: 1200 }, upload });
		expect(deleted).toEqual(['media/old.jpg', 'media/old_thumb.jpg']);
	});

	it('refuses a photo the viewer cannot see on that contact, storing nothing', async () => {
		const { d, stored, put, lookups } = deps(null);
		expect(
			await frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop: { x: 0, y: 0, size: 100 }, upload })
		).toBe(false);
		// The lookup ran for this viewer and contact — the refusal is the answer, not a skipped check.
		expect(lookups).toEqual(['u2 c1 p1']);
		expect(stored).toEqual([]);
		expect(put).toEqual([]);
	});

	it('refuses a square that reaches outside the picture, before storing anything', async () => {
		for (const crop of [
			{ x: 900, y: 0, size: 800 }, // past the right edge of 1600
			{ x: 0, y: 500, size: 800 }, // past the bottom edge of 1200
			{ x: -1, y: 0, size: 100 },
			{ x: 0, y: 0, size: 0 },
			{ x: Number.NaN, y: 0, size: 100 }
		]) {
			const { d, stored, put } = deps(source());
			await expect(frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop, upload })).rejects.toBeInstanceOf(
				InvalidAvatarError
			);
			expect(stored).toEqual([]);
			expect(put).toEqual([]);
		}
		// The same square inside the picture is accepted, so the refusals above are about the edges.
		const { d, stored } = deps(source());
		await frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop: { x: 800, y: 400, size: 800 }, upload });
		expect(stored).toHaveLength(1);
	});

	it('refuses bytes that are not an avatar image, before storing anything', async () => {
		const { d, stored, put } = deps(source());
		const notAnImage = { ...upload, image: new Uint8Array([1, 2, 3]) };
		await expect(
			frameAsAvatar(d, viewer, { contactId: 'c1', photoId: 'p1', crop: { x: 0, y: 0, size: 100 }, upload: notAnImage })
		).rejects.toBeInstanceOf(InvalidAvatarError);
		expect(stored).toEqual([]);
		expect(put).toEqual([]);
	});
});
