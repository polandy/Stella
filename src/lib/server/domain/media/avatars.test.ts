import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	AVATAR_MAX_BYTES,
	InvalidAvatarError,
	setContactAvatar,
	sniffImageMime,
	validateAvatarUpload,
	type AvatarDeps,
	type AvatarUpload,
	type MediaStore,
	type PhotoRepository,
	type StoredPhoto
} from './avatars';

/*
 * Avatar validation + the setContactAvatar use-case (docs/02 §2.14). Pure and fake-driven —
 * no filesystem, no DB. Proves magic-byte sniffing, the size/format guards, and that a valid
 * upload is stored and wired up as the contact's avatar.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const upload = (over: Partial<AvatarUpload> = {}): AvatarUpload => ({
	image: JPEG,
	thumb: JPEG,
	width: 512,
	height: 512,
	...over
});

describe('sniffImageMime', () => {
	it('recognises jpeg and png by magic bytes', () => {
		expect(sniffImageMime(JPEG)).toBe('image/jpeg');
		expect(sniffImageMime(PNG)).toBe('image/png');
	});
	it('rejects non-images', () => {
		expect(sniffImageMime(new Uint8Array([0, 1, 2, 3]))).toBeNull();
	});
});

describe('validateAvatarUpload', () => {
	it('returns the sniffed mime for a valid upload', () => {
		expect(validateAvatarUpload(upload())).toBe('image/jpeg');
	});
	it('rejects an empty image', () => {
		expect(() => validateAvatarUpload(upload({ image: new Uint8Array() }))).toThrow(InvalidAvatarError);
	});
	it('rejects an oversized image', () => {
		const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
		big.set(JPEG);
		expect(() => validateAvatarUpload(upload({ image: big }))).toThrow(/too large/);
	});
	it('rejects bytes that are not a supported image', () => {
		expect(() => validateAvatarUpload(upload({ image: new Uint8Array([1, 2, 3, 4]) }))).toThrow(/Unsupported/);
	});
	it('rejects a thumbnail of a different format', () => {
		expect(() => validateAvatarUpload(upload({ thumb: PNG }))).toThrow(/mismatch/);
	});
	it('rejects invalid dimensions', () => {
		expect(() => validateAvatarUpload(upload({ width: 0 }))).toThrow(/dimensions/);
	});
});

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const idGen: IdGenerator = { next: () => 'photo-1' };

function fakeDeps() {
	const store = new Map<string, Uint8Array>();
	let inserted: StoredPhoto | null = null;
	let avatarSet: { contactId: string; photoId: string } | null = null;
	const media: MediaStore = {
		put: async (key, bytes) => {
			store.set(key, bytes);
			return `avatars/${key}`;
		},
		read: async (path) => store.get(path.replace('avatars/', '')) ?? null,
		delete: async () => {}
	};
	const photos: PhotoRepository = {
		insert: async (p) => {
			inserted = p;
		},
		exists: async () => false,
		setContactAvatar: async (contactId, photoId) => {
			avatarSet = { contactId, photoId };
		},
		getVisiblePhotoFile: async () => null,
		listJournalPhotos: async () => [],
		listGalleryPhotos: async () => [],
		findVisibleGalleryPhoto: async () => null,
		updateOwnGalleryPhoto: async () => false,
		deleteOwnGalleryPhoto: async () => null
	};
	const deps: AvatarDeps = { photos, media, ids: idGen, clock };
	return {
		deps,
		store,
		get inserted() {
			return inserted;
		},
		get avatarSet() {
			return avatarSet;
		}
	};
}

describe('setContactAvatar', () => {
	it('stores both files and records the photo as the contact avatar', async () => {
		const f = fakeDeps();
		const id = await setContactAvatar(f.deps, { userId: 'u1', householdId: 'h1' }, 'mara', upload());

		expect(id).toBe('photo-1');
		expect([...f.store.keys()].sort()).toEqual(['photo-1.jpg', 'photo-1_thumb.jpg']);
		expect(f.inserted).toMatchObject({
			id: 'photo-1',
			contactId: 'mara',
			createdBy: 'u1',
			householdId: 'h1',
			visibility: 'shared',
			filePath: 'avatars/photo-1.jpg',
			thumbPath: 'avatars/photo-1_thumb.jpg',
			mime: 'image/jpeg',
			width: 512,
			createdAt: NOW
		});
		expect(f.avatarSet).toEqual({ contactId: 'mara', photoId: 'photo-1' });
	});

	it('rejects an invalid upload before storing anything', async () => {
		const f = fakeDeps();
		await expect(
			setContactAvatar(f.deps, { userId: 'u1', householdId: 'h1' }, 'mara', upload({ image: new Uint8Array([0, 0]) }))
		).rejects.toThrow(InvalidAvatarError);
		expect(f.store.size).toBe(0);
		expect(f.inserted).toBeNull();
	});
});
