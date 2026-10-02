import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { AvatarUpload, MediaStore } from './avatars';
import { InvalidAvatarError } from './avatars';
import {
	cutLeftBehind,
	cutProfilePicture,
	cutsToTurn,
	listCircleCuts,
	ownPhotoFromCut,
	type CircleCutRow,
	type Cut,
	type CutDeps,
	type GroupPhoto
} from './cuts';
import type { StoredFraming } from './framing';

/*
 * Profile pictures cut from a group photo (docs/concepts/circle-photos.md §5). A cut is a
 * framing of a circle photo that one person wears. These rules decide which cuts must become
 * photos of their own before something takes their group photo away, and how such a photo reads.
 */

const cut = (id: string, contactId: string, groupPhotoId: string): Cut => ({ id, contactId, groupPhotoId });

describe('which cuts a group photo takes with it', () => {
	const cuts = [cut('f1', 'anna', 'class'), cut('f2', 'ben', 'class'), cut('f3', 'cleo', 'team')];

	it('turns every cut of the photo that goes, and counts the people wearing them', () => {
		expect(cutsToTurn(cuts, ['class'])).toEqual({ cutIds: ['f1', 'f2'], people: 2 });
	});

	it('turns nothing for a photo nobody wears', () => {
		expect(cutsToTurn(cuts, ['summer'])).toEqual({ cutIds: [], people: 0 });
	});

	it('asks one combined question when a whole circle goes, counting each person once', () => {
		// A person wears one picture; an older cut of another photo of theirs counts them again only once.
		const withTwo = [...cuts, cut('f4', 'anna', 'team')];
		expect(cutsToTurn(withTwo, ['class', 'team'])).toEqual({ cutIds: ['f1', 'f2', 'f3', 'f4'], people: 3 });
	});
});

describe('the cut a person stops wearing', () => {
	const worn = { id: 'f1', framingOf: 'class', isCut: true };

	it('is kept as their own photo when they switch to an upload', () => {
		expect(cutLeftBehind(worn, { framingOf: null })).toBe('f1');
	});

	it('is kept when they switch to a cut of another group photo', () => {
		expect(cutLeftBehind(worn, { framingOf: 'team' })).toBe('f1');
	});

	it('is replaced, not kept, when the same group photo is cut again for them', () => {
		expect(cutLeftBehind(worn, { framingOf: 'class' })).toBeNull();
	});

	it('is nothing when what they wore was not a cut', () => {
		expect(cutLeftBehind({ id: 'p9', framingOf: 'gallery-photo', isCut: false }, { framingOf: null })).toBeNull();
		expect(cutLeftBehind(null, { framingOf: null })).toBeNull();
	});
});

describe('a cut turned into a photo of its own', () => {
	const group = { id: 'class', createdAt: 1_700_000_000_000, takenAt: '2024-09-01' };

	it('is dated like its group photo and remembers it after a switch', () => {
		expect(ownPhotoFromCut({ visibility: 'shared' }, group, 'switched')).toEqual({
			cutFrom: 'class',
			createdAt: group.createdAt,
			takenAt: '2024-09-01',
			visibility: 'shared'
		});
	});

	it('becomes shared when its group photo turns private, so the person keeps their face', () => {
		expect(ownPhotoFromCut({ visibility: 'shared' }, group, 'groupPhotoPrivate')).toMatchObject({
			cutFrom: 'class',
			visibility: 'shared'
		});
	});

	it('forgets a group photo that is removed, and keeps its own visibility', () => {
		expect(ownPhotoFromCut({ visibility: 'private' }, group, 'groupPhotoRemoved')).toEqual({
			cutFrom: null,
			createdAt: group.createdAt,
			takenAt: '2024-09-01',
			visibility: 'private'
		});
	});
});

// ── Cutting a picture for someone ────────────────────────────────────────

const viewer: Viewer = { id: 'u2', householdId: 'h1' };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const upload: AvatarUpload = { image: JPEG, thumb: JPEG, width: 1024, height: 1024 };
const classPhoto: GroupPhoto = {
	id: 'class',
	circleId: 'k1',
	createdBy: 'u1',
	visibility: 'shared',
	width: 4096,
	height: 2731
};

function cutDeps(options: { group?: GroupPhoto | null; personVisible?: boolean; rows?: CircleCutRow[] } = {}) {
	const stored: StoredFraming[] = [];
	const put: string[] = [];
	const deleted: string[] = [];
	const asked: string[] = [];
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
	const d: CutDeps = {
		cuts: {
			async findVisibleGroupPhoto(v, photoId) {
				asked.push(`photo ${v.id} ${photoId}`);
				return options.group === undefined ? classPhoto : options.group;
			},
			async replaceCut(cut) {
				stored.push(cut);
				return [{ filePath: 'media/old.jpg', thumbPath: 'media/old_thumb.jpg' }];
			},
			async listCutsOfCircle() {
				return options.rows ?? [];
			},
			async listGroupPhotosOf() {
				return [];
			},
			async listGroupPhotosToCut() {
				return [];
			}
		},
		contacts: {
			async findByIdVisibleTo(v, contactId) {
				asked.push(`person ${v.id} ${contactId}`);
				return options.personVisible === false ? null : ({ id: contactId } as never);
			}
		},
		media,
		ids: { next: () => 'f9' },
		clock: { now: () => 7000 }
	};
	return { d, stored, put, deleted, asked };
}

describe('cutting a profile picture out of a group photo', () => {
	const crop = { x: 1200, y: 400, size: 300 };

	it('stores the square as a framing of the group photo that the person wears', async () => {
		const { d, stored, put, deleted } = cutDeps();
		expect(await cutProfilePicture(d, viewer, { photoId: 'class', contactId: 'anna', crop, upload })).toBe(true);
		expect(put).toEqual(['f9.jpg', 'f9_thumb.jpg']);
		expect(stored).toEqual([
			{
				id: 'f9',
				householdId: 'h1',
				contactId: 'anna',
				journalEntryId: null,
				framingOf: 'class',
				crop,
				createdBy: 'u1',
				visibility: 'shared',
				filePath: 'media/f9.jpg',
				thumbPath: 'media/f9_thumb.jpg',
				mime: 'image/jpeg',
				width: 1024,
				height: 1024,
				sizeBytes: JPEG.byteLength,
				createdAt: 7000
			}
		]);
		// Cutting again for the same person replaced their earlier square, bytes included.
		expect(deleted).toEqual(['media/old.jpg', 'media/old_thumb.jpg']);
	});

	it('refuses a group photo the viewer cannot see, storing nothing', async () => {
		const { d, stored, put, asked } = cutDeps({ group: null });
		expect(await cutProfilePicture(d, viewer, { photoId: 'class', contactId: 'anna', crop, upload })).toBe(false);
		expect(asked).toContain('photo u2 class');
		expect(stored).toEqual([]);
		expect(put).toEqual([]);
	});

	it('refuses a person the viewer cannot see, storing nothing', async () => {
		const { d, stored, put, asked } = cutDeps({ personVisible: false });
		expect(await cutProfilePicture(d, viewer, { photoId: 'class', contactId: 'anna', crop, upload })).toBe(false);
		expect(asked).toContain('person u2 anna');
		expect(stored).toEqual([]);
		expect(put).toEqual([]);
	});

	it('refuses a square outside the full picture', async () => {
		const { d, stored } = cutDeps();
		const outside = { x: 4000, y: 0, size: 300 };
		await expect(
			cutProfilePicture(d, viewer, { photoId: 'class', contactId: 'anna', crop: outside, upload })
		).rejects.toBeInstanceOf(InvalidAvatarError);
		expect(stored).toEqual([]);
	});
});

describe("a circle's cuts, as its page shows them", () => {
	it('counts everyone wearing a cut of each photo but names only the people the viewer sees', async () => {
		const { d } = cutDeps({
			rows: [
				{ groupPhotoId: 'class', contactId: 'anna', crop: { x: 0, y: 0, size: 300 } },
				{ groupPhotoId: 'class', contactId: null, crop: null },
				{ groupPhotoId: 'team', contactId: 'ben', crop: { x: 10, y: 10, size: 400 } }
			]
		});
		expect(await listCircleCuts(d, viewer, 'k1')).toEqual({
			class: { people: 2, wearers: [{ contactId: 'anna', crop: { x: 0, y: 0, size: 300 } }] },
			team: { people: 1, wearers: [{ contactId: 'ben', crop: { x: 10, y: 10, size: 400 } }] }
		});
	});
});
