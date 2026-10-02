import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { CaptionTooLongError, CAPTION_MAX_LENGTH } from '../media/gallery';
import { InvalidImageError, JOURNAL_IMAGE_MAX_BYTES } from '../media/journal-photos';
import type { Circle, MemberView } from './circles';
import {
	addCirclePhoto,
	captionCirclePhoto,
	CircleGoneError,
	listCircleCovers,
	pinCirclePhoto,
	prepareCirclePhotoUpload,
	removeCirclePhoto,
	setCirclePhotoRole,
	setCirclePhotoVisibility,
	UnknownPhotoRoleError,
	type CirclePhoto,
	type CirclePhotoDescription,
	type CirclePhotoDeps,
	type CirclePhotoRepository,
	type StoredCirclePhoto
} from './circle-photos';

/*
 * The photos of a circle (docs/02 §2.4.2, docs/concepts/circle-photos.md §4): who may do what
 * to them, and which roles they may carry. Use-cases over the ports, tested with fakes.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const other: Viewer = { id: 'u2', householdId: 'h1' };
const NOW = 9_000;

const circle: Circle = {
	id: 'k1',
	householdId: 'h1',
	createdBy: 'u1',
	visibility: 'shared',
	name: 'Class 1B',
	description: null,
	kind: 'class',
	color: 'teal',
	startDate: null,
	endDate: null
};

const member = (contactId: string, role: string | null): MemberView => ({
	membershipId: `m-${contactId}`,
	contactId,
	displayName: contactId,
	avatarPhotoId: null,
	role
});

const photo = (over: Partial<CirclePhoto> = {}): CirclePhoto => ({
	id: 'p1',
	circleId: 'k1',
	role: null,
	caption: null,
	visibility: 'shared',
	createdBy: 'u1',
	createdByName: 'One',
	width: 1600,
	height: 1200,
	createdAt: 1_000,
	pinnedAt: null,
	...over
});

function deps(
	over: {
		photos?: CirclePhoto[];
		members?: MemberView[];
		circleVisible?: boolean;
	} = {}
) {
	const photos = over.photos ?? [photo()];
	const inserted: StoredCirclePhoto[] = [];
	const described: { photoId: string; changes: CirclePhotoDescription }[] = [];
	const rescoped: { authorId: string; circleId: string; photoId: string; visibility: string }[] = [];
	const files: Record<string, Uint8Array> = {};
	const deletedFiles: string[] = [];

	const circlePhotos: CirclePhotoRepository = {
		async insert(p) {
			inserted.push(p);
		},
		async listVisible(_v, circleId) {
			return photos.filter((p) => p.circleId === circleId);
		},
		async findVisible(_v, circleId, photoId) {
			return photos.find((p) => p.id === photoId && p.circleId === circleId) ?? null;
		},
		async describe(photoId, changes) {
			described.push({ photoId, changes });
		},
		async setOwnVisibility(input) {
			const found = photos.find((p) => p.id === input.photoId && p.circleId === input.circleId);
			if (!found || found.createdBy !== input.authorId) return false;
			rescoped.push(input);
			return true;
		},
		async deleteOwn(input) {
			const found = photos.find((p) => p.id === input.photoId && p.circleId === input.circleId);
			if (!found || found.createdBy !== input.authorId) return null;
			return {
				filePath: `${input.photoId}.jpg`,
				thumbPath: `${input.photoId}_thumb.jpg`,
				viewPath: `${input.photoId}_view.jpg`
			};
		},
		async listCoverCandidates() {
			return photos;
		}
	};

	const d: CirclePhotoDeps = {
		circlePhotos,
		circles: {
			async getVisibleTo() {
				return over.circleVisible === false ? null : circle;
			},
			async listMembersVisibleTo() {
				return over.members ?? [member('ann', 'Student'), member('bea', 'Teacher')];
			}
		},
		media: {
			async put(key, bytes) {
				files[key] = bytes;
				return key;
			},
			async read() {
				return null;
			},
			async delete(path) {
				deletedFiles.push(path);
			}
		},
		ids: { next: () => 'new-photo' },
		clock: { now: () => NOW }
	};
	return { deps: d, inserted, described, rescoped, files, deletedFiles };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const upload = { image: JPEG, thumb: JPEG, width: 1600, height: 900 };

describe('prepareCirclePhotoUpload', () => {
	it('names the circle, the role as the members spell it, and the visibility', async () => {
		const { deps: d } = deps();
		expect(await prepareCirclePhotoUpload(d, viewer, { circleId: 'k1', role: 'student', visibility: 'private' })).toEqual({
			circleId: 'k1',
			role: 'Student',
			visibility: 'private'
		});
	});

	it('takes no role for the circle as a whole', async () => {
		const { deps: d } = deps();
		const prepared = await prepareCirclePhotoUpload(d, viewer, { circleId: 'k1', role: null, visibility: 'shared' });
		expect(prepared.role).toBeNull();
	});

	it('still takes a role only photos carry, so a queued upload is not lost to a re-role', async () => {
		const { deps: d } = deps({ photos: [photo({ role: 'Parent' })] });
		const prepared = await prepareCirclePhotoUpload(d, viewer, { circleId: 'k1', role: 'parent', visibility: 'shared' });
		expect(prepared.role).toBe('Parent');
	});

	it('refuses a role the circle does not have', async () => {
		const { deps: d } = deps();
		await expect(prepareCirclePhotoUpload(d, viewer, { circleId: 'k1', role: 'Coach', visibility: 'shared' })).rejects.toBeInstanceOf(
			UnknownPhotoRoleError
		);
	});

	it('refuses a circle the uploader cannot see (any more)', async () => {
		const { deps: d } = deps({ circleVisible: false });
		await expect(prepareCirclePhotoUpload(d, viewer, { circleId: 'k1', role: null, visibility: 'shared' })).rejects.toBeInstanceOf(
			CircleGoneError
		);
	});
});

describe('addCirclePhoto', () => {
	it('stores both renditions and the photo with its circle, role and uploader', async () => {
		const { deps: d, inserted, files } = deps();
		const id = await addCirclePhoto(d, { userId: 'u1', householdId: 'h1' }, { circleId: 'k1', role: 'Student', visibility: 'shared', upload });
		expect(id).toBe('new-photo');
		expect(Object.keys(files)).toEqual(['new-photo.jpg', 'new-photo_thumb.jpg']);
		expect(inserted).toEqual([
			{
				id: 'new-photo',
				householdId: 'h1',
				circleId: 'k1',
				circleRole: 'Student',
				createdBy: 'u1',
				visibility: 'shared',
				filePath: 'new-photo.jpg',
				thumbPath: 'new-photo_thumb.jpg',
				viewPath: null,
				mime: 'image/jpeg',
				width: 1600,
				height: 900,
				sizeBytes: JPEG.byteLength,
				createdAt: NOW
			}
		]);
	});

	it('refuses bytes that are not an image', async () => {
		const { deps: d, inserted } = deps();
		const notImage = { ...upload, image: new Uint8Array([1, 2, 3]) };
		await expect(
			addCirclePhoto(d, { userId: 'u1', householdId: 'h1' }, { circleId: 'k1', role: null, visibility: 'shared', upload: notImage })
		).rejects.toBeInstanceOf(InvalidImageError);
		expect(inserted).toEqual([]);
	});

	// Concept §5.3: a group photo is kept up to 4096 px so faces can be cut from it; the grid
	// and the lightbox load a 1600 px view instead, so only the cropper pays for the full one.
	it('keeps a large picture whole beside its 1600 px view', async () => {
		const { deps: d, inserted, files } = deps();
		const large = { ...upload, width: 4096, height: 2304, view: JPEG };
		await addCirclePhoto(d, { userId: 'u1', householdId: 'h1' }, { circleId: 'k1', role: null, visibility: 'shared', upload: large });
		expect(Object.keys(files)).toEqual(['new-photo.jpg', 'new-photo_view.jpg', 'new-photo_thumb.jpg']);
		expect(inserted[0]).toMatchObject({ filePath: 'new-photo.jpg', viewPath: 'new-photo_view.jpg', width: 4096, height: 2304 });
	});

	it('takes a full picture larger than a person’s photo may be', async () => {
		const { deps: d, inserted } = deps();
		const big = new Uint8Array(JOURNAL_IMAGE_MAX_BYTES + 1);
		big.set(JPEG);
		const large = { ...upload, image: big, width: 4096, height: 2304, view: JPEG };
		await addCirclePhoto(d, { userId: 'u1', householdId: 'h1' }, { circleId: 'k1', role: null, visibility: 'shared', upload: large });
		expect(inserted).toHaveLength(1);
	});

	it('refuses a view that is not the same kind of image', async () => {
		const { deps: d, inserted } = deps();
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
		const mismatched = { ...upload, width: 4096, height: 2304, view: png };
		await expect(
			addCirclePhoto(d, { userId: 'u1', householdId: 'h1' }, { circleId: 'k1', role: null, visibility: 'shared', upload: mismatched })
		).rejects.toBeInstanceOf(InvalidImageError);
		expect(inserted).toEqual([]);
	});
});

describe('captionCirclePhoto', () => {
	it('lets anyone who sees the photo caption it, not only its uploader', async () => {
		const { deps: d, described } = deps();
		expect(await captionCirclePhoto(d, other, { circleId: 'k1', photoId: 'p1', caption: '  First day  ' })).toBe(true);
		expect(described).toEqual([{ photoId: 'p1', changes: { caption: 'First day' } }]);
	});

	it('clears the caption when blank', async () => {
		const { deps: d, described } = deps();
		await captionCirclePhoto(d, other, { circleId: 'k1', photoId: 'p1', caption: '   ' });
		expect(described).toEqual([{ photoId: 'p1', changes: { caption: null } }]);
	});

	it('refuses a caption that is too long', async () => {
		const { deps: d } = deps();
		const caption = 'x'.repeat(CAPTION_MAX_LENGTH + 1);
		await expect(captionCirclePhoto(d, viewer, { circleId: 'k1', photoId: 'p1', caption })).rejects.toBeInstanceOf(CaptionTooLongError);
	});

	it('changes nothing on a photo the viewer cannot see', async () => {
		const { deps: d, described } = deps();
		expect(await captionCirclePhoto(d, other, { circleId: 'k1', photoId: 'elsewhere', caption: 'x' })).toBe(false);
		expect(described).toEqual([]);
	});
});

describe('setCirclePhotoRole', () => {
	it('lets anyone who sees the photo give it one of the circle’s roles', async () => {
		const { deps: d, described } = deps();
		expect(await setCirclePhotoRole(d, other, { circleId: 'k1', photoId: 'p1', role: 'teacher' })).toBe(true);
		expect(described).toEqual([{ photoId: 'p1', changes: { role: 'Teacher' } }]);
	});

	it('takes the role away with a blank pick', async () => {
		const { deps: d, described } = deps({ photos: [photo({ role: 'Student' })] });
		await setCirclePhotoRole(d, viewer, { circleId: 'k1', photoId: 'p1', role: '' });
		expect(described).toEqual([{ photoId: 'p1', changes: { role: null } }]);
	});

	it('keeps offering the photo’s own role after its members are gone', async () => {
		const { deps: d, described } = deps({ photos: [photo({ role: 'Parent' })] });
		expect(await setCirclePhotoRole(d, viewer, { circleId: 'k1', photoId: 'p1', role: 'Parent' })).toBe(true);
		expect(described).toEqual([{ photoId: 'p1', changes: { role: 'Parent' } }]);
	});

	it('refuses a role that is neither the circle’s nor the photo’s', async () => {
		const { deps: d, described } = deps();
		await expect(setCirclePhotoRole(d, viewer, { circleId: 'k1', photoId: 'p1', role: 'Coach' })).rejects.toBeInstanceOf(
			UnknownPhotoRoleError
		);
		expect(described).toEqual([]);
	});

	it('changes nothing on a photo the viewer cannot see', async () => {
		const { deps: d } = deps();
		expect(await setCirclePhotoRole(d, viewer, { circleId: 'k1', photoId: 'gone', role: null })).toBe(false);
	});
});

describe('pinCirclePhoto', () => {
	it('lets anyone who sees the photo pin it, at the moment it was pinned', async () => {
		const { deps: d, described } = deps();
		expect(await pinCirclePhoto(d, other, { circleId: 'k1', photoId: 'p1', pinned: true })).toBe(true);
		expect(described).toEqual([{ photoId: 'p1', changes: { pinnedAt: NOW } }]);
	});

	it('keeps the first pin when the same pin is sent twice', async () => {
		const { deps: d, described } = deps({ photos: [photo({ pinnedAt: 5 })] });
		expect(await pinCirclePhoto(d, viewer, { circleId: 'k1', photoId: 'p1', pinned: true })).toBe(true);
		expect(described).toEqual([]);
	});

	it('unpins', async () => {
		const { deps: d, described } = deps({ photos: [photo({ pinnedAt: 5 })] });
		await pinCirclePhoto(d, viewer, { circleId: 'k1', photoId: 'p1', pinned: false });
		expect(described).toEqual([{ photoId: 'p1', changes: { pinnedAt: null } }]);
	});
});

describe('setCirclePhotoVisibility', () => {
	it('lets the uploader make it private', async () => {
		const { deps: d, rescoped } = deps();
		expect(await setCirclePhotoVisibility(d, viewer, { circleId: 'k1', photoId: 'p1', visibility: 'private' })).toBe(true);
		expect(rescoped).toEqual([{ authorId: 'u1', circleId: 'k1', photoId: 'p1', visibility: 'private' }]);
	});

	it('is the uploader’s alone', async () => {
		const { deps: d, rescoped } = deps();
		expect(await setCirclePhotoVisibility(d, other, { circleId: 'k1', photoId: 'p1', visibility: 'private' })).toBe(false);
		expect(rescoped).toEqual([]);
	});
});

describe('removeCirclePhoto', () => {
	it('lets the uploader remove it, files included', async () => {
		const { deps: d, deletedFiles } = deps();
		expect(await removeCirclePhoto(d, viewer, { circleId: 'k1', photoId: 'p1' })).toBe(true);
		expect(deletedFiles).toEqual(['p1.jpg', 'p1_thumb.jpg', 'p1_view.jpg']);
	});

	it('is the uploader’s alone', async () => {
		const { deps: d, deletedFiles } = deps();
		expect(await removeCirclePhoto(d, other, { circleId: 'k1', photoId: 'p1' })).toBe(false);
		expect(deletedFiles).toEqual([]);
	});
});

describe('listCircleCovers', () => {
	it('gives each circle the lead photo of those without a role', async () => {
		const { deps: d } = deps({
			photos: [
				photo({ id: 'a-old', circleId: 'a', createdAt: 1 }),
				photo({ id: 'a-new', circleId: 'a', createdAt: 2 }),
				photo({ id: 'b-role', circleId: 'b', role: 'Student', createdAt: 3 }),
				photo({ id: 'c-fav', circleId: 'c', createdAt: 1, pinnedAt: 4 }),
				photo({ id: 'c-new', circleId: 'c', createdAt: 9 })
			]
		});
		expect(await listCircleCovers(d, viewer)).toEqual({ a: 'a-new', c: 'c-fav' });
	});
});
