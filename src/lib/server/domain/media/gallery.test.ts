import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { GalleryPhoto, PhotoRepository } from './avatars';
import {
	captionGalleryPhoto,
	CaptionTooLongError,
	listGallery,
	removeGalleryPhoto,
	setGalleryPhotoVisibility,
	useAsAvatar,
	CAPTION_MAX_LENGTH,
	type GalleryDeps
} from './gallery';

/*
 * The photo gallery on a person (docs/02 §2.14): list, caption, re-scope, set as avatar,
 * delete. Every rule that decides *who may do what* lives here, over the repository port,
 * so it is tested with fakes rather than through a route.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };

const photo = (over: Partial<GalleryPhoto> = {}): GalleryPhoto => ({
	id: 'p1',
	contactId: 'c1',
	caption: null,
	visibility: 'shared',
	createdBy: 'u1',
	width: 1600,
	height: 1200,
	createdAt: 1000,
	isAvatar: false,
	...over
});

function deps(over: { photos?: GalleryPhoto[]; visible?: GalleryPhoto | null } = {}) {
	const calls: string[] = [];
	const deleted: string[] = [];
	const avatars: [string, string][] = [];
	const updates: {
		authorId: string;
		photoId: string;
		caption?: string | null;
		visibility?: 'shared' | 'private';
	}[] = [];

	const photos: Partial<PhotoRepository> = {
		async listGalleryPhotos(v, contactId) {
			calls.push(`list ${v.id} ${contactId}`);
			return over.photos ?? [];
		},
		async findVisibleGalleryPhoto(v, contactId, photoId) {
			calls.push(`find ${v.id} ${contactId} ${photoId}`);
			return over.visible ?? null;
		},
		async updateOwnGalleryPhoto(input) {
			updates.push(input);
			return input.authorId === 'u1'; // only the author's own updates land
		},
		async deleteOwnGalleryPhoto(input) {
			if (input.authorId !== 'u1') return null;
			deleted.push(input.photoId);
			return { filePath: `/m/${input.photoId}.jpg`, thumbPath: `/m/${input.photoId}_t.jpg` };
		},
		async setContactAvatar(contactId, photoId) {
			avatars.push([contactId, photoId]);
		}
	};
	const removedFiles: string[] = [];
	const d: GalleryDeps & {
		calls: string[];
		deleted: string[];
		avatars: [string, string][];
		updates: typeof updates;
		removedFiles: string[];
	} = {
		calls,
		deleted,
		avatars,
		updates,
		removedFiles,
		photos: photos as PhotoRepository,
		media: {
			async put() {
				return '';
			},
			async read() {
				return null;
			},
			async delete(path: string) {
				removedFiles.push(path);
			}
		}
	};
	return d;
}

describe('listGallery', () => {
	it('asks the repository for this viewer and this contact', async () => {
		const d = deps({ photos: [photo(), photo({ id: 'p2' })] });
		expect(await listGallery(d, viewer, 'c1')).toHaveLength(2);
		expect(d.calls).toEqual(['list u1 c1']);
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
		expect(await captionGalleryPhoto(d, { id: 'u2', householdId: 'h1' }, 'p1', 'Mine now')).toBe(false);
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

describe('removeGalleryPhoto', () => {
	it('removes the row first, then both files', async () => {
		const d = deps();
		expect(await removeGalleryPhoto(d, viewer, 'p1')).toBe(true);
		expect(d.deleted).toEqual(['p1']);
		expect(d.removedFiles).toEqual(['/m/p1.jpg', '/m/p1_t.jpg']);
	});

	it('touches no file when the row was not the caller’s to remove', async () => {
		const d = deps();
		expect(await removeGalleryPhoto(d, { id: 'u2', householdId: 'h1' }, 'p1')).toBe(false);
		expect(d.removedFiles).toEqual([]);
	});
});

describe('useAsAvatar', () => {
	it('sets a visible gallery photo of that contact as their avatar', async () => {
		const d = deps({ visible: photo() });
		expect(await useAsAvatar(d, viewer, 'c1', 'p1')).toBe(true);
		expect(d.calls).toEqual(['find u1 c1 p1']);
		expect(d.avatars).toEqual([['c1', 'p1']]);
	});

	it('refuses a photo the viewer cannot see or that belongs elsewhere', async () => {
		const d = deps({ visible: null });
		expect(await useAsAvatar(d, viewer, 'c1', 'p1')).toBe(false);
		expect(d.avatars).toEqual([]);
	});
});
