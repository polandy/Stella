import type { GalleryPhoto, PhotoRepository } from '../media/avatars';
import type { GalleryPhotoReads } from '../media/gallery';

/*
 * In-memory read models of a person's photos. Like the people fakes (`contacts.ts`), the photos
 * a fake is built over are the ones the viewer may see: scoping is the access layer's job,
 * covered against SQLite in `db/photo-reads.test.ts`.
 */

/** A shared gallery photo of `c1`, undated, unpinned and not worn, plus what the test is about. */
export function someGalleryPhoto(
	id: string,
	fields: Partial<Omit<GalleryPhoto, 'id'>> = {}
): GalleryPhoto {
	return {
		id,
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
		cutFrom: null,
		...fields
	};
}

/**
 * `GalleryPhotoReads` over a fixed list of photos, newest added first. The capture date's part
 * in the order is the adapter's (`db/photo-dated-at.ts`), and `orderGallery` puts the
 * favourites first on top of either.
 */
export function inMemoryGalleryPhotos(photos: readonly GalleryPhoto[]): GalleryPhotoReads {
	return {
		listGalleryPhotos: async (_viewer, contactId) =>
			photos.filter((p) => p.contactId === contactId).sort((a, b) => b.createdAt - a.createdAt),
		findVisibleGalleryPhoto: async (_viewer, contactId, photoId) =>
			photos.find((p) => p.id === photoId && p.contactId === contactId) ?? null
	};
}

/** Every method of the port: a method added to it and not here fails to compile. */
const PHOTO_REPOSITORY_METHODS: Record<keyof PhotoRepository, true> = {
	insert: true,
	exists: true,
	setContactAvatar: true,
	setGalleryPhotoPin: true,
	updateOwnGalleryPhoto: true,
	findRemovableGalleryPhoto: true,
	deleteRemovableGalleryPhoto: true
};

/**
 * A `PhotoRepository` that does what the test hands it and fails loud on anything else (as
 * `contactRepositoryWith`). The writes a test records are its own: that is what it asserts.
 */
export function photoRepositoryWith(methods: Partial<PhotoRepository>): PhotoRepository {
	const unexpected = (name: string) => async () => {
		throw new Error(`PhotoRepository.${name} was not expected in this test`);
	};
	const stubs = Object.fromEntries(
		Object.keys(PHOTO_REPOSITORY_METHODS).map((name) => [name, unexpected(name)])
	) as unknown as PhotoRepository;
	return { ...stubs, ...methods };
}
