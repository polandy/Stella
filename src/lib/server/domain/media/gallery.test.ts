import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { fixedClock, inMemoryGalleryPhotos, sequentialIds, someGalleryPhoto } from '../testing';
import type { GalleryPhoto } from './avatars';
import {
	captionGalleryPhoto,
	CaptionTooLongError,
	listGallery,
	pinGalleryPhoto,
	setGalleryPhotoVisibility,
	CAPTION_MAX_LENGTH,
	type GalleryDeps
} from './gallery';

/*
 * The photo gallery on a person (docs/02 §2.14): list, caption, re-scope,
 * delete. Every rule that decides *who may do what* lives here, over the repository port,
 * so it is tested with fakes rather than through a route.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const NOW = 5_000;

function deps(over: { photos?: GalleryPhoto[] } = {}) {
	const pins: { photoId: string; pinnedAt: number | null }[] = [];
	const updates: {
		authorId: string;
		photoId: string;
		caption?: string | null;
		visibility?: 'shared' | 'private';
	}[] = [];

	const photos: GalleryDeps['photos'] = {
		async setGalleryPhotoPin(photoId, pinnedAt) {
			pins.push({ photoId, pinnedAt });
		},
		async updateOwnGalleryPhoto(input) {
			updates.push(input);
			return input.authorId === 'u1'; // only the author's own updates land
		},
		async findRemovableGalleryPhoto() {
			throw new Error('removal is tested against the real adapter (remove-gallery-photo.test.ts)');
		},
		async deleteRemovableGalleryPhoto() {
			throw new Error('removal is tested against the real adapter (remove-gallery-photo.test.ts)');
		}
	};
	const removedFiles: string[] = [];
	const d: GalleryDeps & {
		pins: typeof pins;
		updates: typeof updates;
		removedFiles: string[];
	} = {
		pins,
		updates,
		removedFiles,
		gallery: inMemoryGalleryPhotos(over.photos ?? []),
		photos,
		ids: sequentialIds('activity'),
		clock: fixedClock(NOW),
		media: {
			async delete(path: string) {
				removedFiles.push(path);
			}
		}
	};
	return d;
}

describe('listGallery', () => {
	it('lists that person’s photos and no one else’s', async () => {
		const d = deps({
			photos: [
				someGalleryPhoto('p1'),
				someGalleryPhoto('p2'),
				someGalleryPhoto('other', { contactId: 'c2' })
			]
		});
		expect((await listGallery(d, viewer, 'c1')).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
	});

	it('shows the favourites first, then the rest newest first', async () => {
		const d = deps({
			photos: [
				someGalleryPhoto('new', { createdAt: 3 }),
				someGalleryPhoto('old', { createdAt: 1, pinnedAt: 9 }),
				someGalleryPhoto('mid', { createdAt: 2 })
			]
		});
		expect((await listGallery(d, viewer, 'c1')).map((p) => p.id)).toEqual(['old', 'new', 'mid']);
	});
});

describe('pinGalleryPhoto', () => {
	const someoneElse: Viewer = { id: 'u2', householdId: 'h1' };

	it('pins a photo the viewer can see, at the time it was pinned', async () => {
		const d = deps({ photos: [someGalleryPhoto('p1')] });
		expect(await pinGalleryPhoto(d, viewer, { contactId: 'c1', photoId: 'p1', pinned: true })).toBe(
			true
		);
		expect(d.pins).toEqual([{ photoId: 'p1', pinnedAt: NOW }]);
	});

	it('lets any member who sees the photo pin it, not only who added it — a pin is the household’s', async () => {
		const d = deps({ photos: [someGalleryPhoto('p1', { createdBy: 'u1' })] });
		expect(
			await pinGalleryPhoto(d, someoneElse, { contactId: 'c1', photoId: 'p1', pinned: true })
		).toBe(true);
		expect(d.pins).toEqual([{ photoId: 'p1', pinnedAt: NOW }]);
	});

	it('keeps the first pin’s time when a pinned photo is pinned again, so a replay changes nothing', async () => {
		const d = deps({ photos: [someGalleryPhoto('p1', { pinnedAt: 1_234 })] });
		expect(await pinGalleryPhoto(d, viewer, { contactId: 'c1', photoId: 'p1', pinned: true })).toBe(
			true
		);
		expect(d.pins).toEqual([]);
	});

	it('unpins a pinned photo', async () => {
		const d = deps({ photos: [someGalleryPhoto('p1', { pinnedAt: 1_234 })] });
		expect(
			await pinGalleryPhoto(d, viewer, { contactId: 'c1', photoId: 'p1', pinned: false })
		).toBe(true);
		expect(d.pins).toEqual([{ photoId: 'p1', pinnedAt: null }]);
	});

	it('writes nothing when unpinning a photo that is not pinned', async () => {
		const d = deps({ photos: [someGalleryPhoto('p1')] });
		expect(
			await pinGalleryPhoto(d, viewer, { contactId: 'c1', photoId: 'p1', pinned: false })
		).toBe(true);
		expect(d.pins).toEqual([]);
	});

	it('refuses a photo of another person, so a page pins only its own', async () => {
		const d = deps({ photos: [someGalleryPhoto('p1', { contactId: 'c2' })] });
		expect(await pinGalleryPhoto(d, viewer, { contactId: 'c1', photoId: 'p1', pinned: true })).toBe(
			false
		);
		expect(d.pins).toEqual([]);
	});

	it('refuses a photo the viewer cannot see, without saying whether it exists', async () => {
		const d = deps({ photos: [] });
		expect(await pinGalleryPhoto(d, viewer, { contactId: 'c1', photoId: 'p1', pinned: true })).toBe(
			false
		);
		expect(d.pins).toEqual([]);
	});
});

describe('captionGalleryPhoto', () => {
	it('stores a trimmed caption on the author’s own photo', async () => {
		const d = deps();
		expect(await captionGalleryPhoto(d, viewer, 'p1', '  At the lake  ')).toBe(true);
		expect(d.updates).toEqual([{ authorId: 'u1', photoId: 'p1', caption: 'At the lake' }]);
	});

	it('clears the caption when the text is blank', async () => {
		const d = deps();
		await captionGalleryPhoto(d, viewer, 'p1', '   ');
		expect(d.updates[0]?.caption).toBeNull();
	});

	it('refuses a caption longer than the limit rather than silently cutting it', async () => {
		const d = deps();
		await expect(
			captionGalleryPhoto(d, viewer, 'p1', 'x'.repeat(CAPTION_MAX_LENGTH + 1))
		).rejects.toBeInstanceOf(CaptionTooLongError);
		expect(d.updates).toEqual([]);
	});

	it('reports back when the photo is not the caller’s to change', async () => {
		const d = deps();
		expect(await captionGalleryPhoto(d, { id: 'u2', householdId: 'h1' }, 'p1', 'Mine now')).toBe(
			false
		);
	});
});

describe('setGalleryPhotoVisibility', () => {
	it('re-scopes the author’s own photo', async () => {
		const d = deps();
		expect(await setGalleryPhotoVisibility(d, viewer, 'p1', 'private')).toBe(true);
		expect(d.updates).toEqual([{ authorId: 'u1', photoId: 'p1', visibility: 'private' }]);
	});

	it('leaves someone else’s photo alone', async () => {
		const d = deps();
		expect(
			await setGalleryPhotoVisibility(d, { id: 'u2', householdId: 'h1' }, 'p1', 'private')
		).toBe(false);
	});
});
