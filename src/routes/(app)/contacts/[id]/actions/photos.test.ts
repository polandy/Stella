import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { contactSectionPath } from '$lib/people/sections';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { GalleryPhoto, PhotoRepository } from '$lib/server/domain/media/avatars';
import { CAPTION_MAX_LENGTH } from '$lib/server/domain/media/gallery';
import type { GroupPhoto } from '$lib/server/domain/media/cuts';
import type { StoredFraming } from '$lib/server/domain/media/framing';
import {
	cutRepositoryWith,
	fixedClock,
	inMemoryGalleryPhotos,
	photoRepositoryWith,
	sequentialIds,
	someGalleryPhoto,
	someGroupPhoto
} from '$lib/server/domain/testing';
import {
	answerOf,
	formOf,
	MEMBER,
	routeEvent,
	type EdgeAnswer,
	type FakeServices
} from '$lib/server/testing';
import { photoActions as actions } from './photos';

/*
 * The gallery card's actions and its lightbox's (docs/02 §2.14) as the edge answers them: the
 * form read, who may change a photo, a photo that is not there, a refusal of the use-case said
 * in the reader's language, and where a success goes back to. The use-cases have their own
 * suites; the ports here only answer the way the case under test needs.
 */

const t = createTranslator('en');
const PAGE = { id: 'anna' };
const BACK_TO_PHOTOS = contactSectionPath('anna', 'photos');
const NOW = 5000;

/** A JPEG as far as sniffing the bytes goes. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const jpeg = (name: string) => new File([JPEG], name);

/** A media store's put that keeps every file it is handed. */
const keepFile = async (key: string) => `media/${key}`;

/** Runs `action` on Anna's page with `form` posted, over `services`. */
const post = (action: (event: never) => Promise<unknown>, services: FakeServices, form: FormData) =>
	answerOf(action(routeEvent({ services, params: PAGE, form })));

/** The 400, 403 or 404 an action answers with the sentence under the photo. */
const refused = (status: number, sentence: string): EdgeAnswer => ({
	kind: 'fail',
	status,
	data: { photoError: sentence }
});

/** The gallery's ports: the photos the viewer sees, and the writes the test hands in. */
function galleryOver(photos: readonly GalleryPhoto[], writes: Partial<PhotoRepository> = {}) {
	const deleted: string[] = [];
	const services: FakeServices = {
		media: {
			galleryDeps: {
				gallery: inMemoryGalleryPhotos(photos),
				photos: photoRepositoryWith(writes),
				media: { delete: async (path) => void deleted.push(path) },
				ids: sequentialIds('activity'),
				clock: fixedClock(NOW)
			}
		}
	};
	return { services, deleted };
}

describe('captionPhoto', () => {
	const caption = { photoId: 'p1', caption: '  At the lake  ' };
	type CaptionWrite = Parameters<PhotoRepository['updateOwnGalleryPhoto']>[0];

	/** The uploader's write, answering whether the photo was theirs. */
	const captioning = (theirs: boolean, written: CaptionWrite[] = []) =>
		galleryOver([], {
			updateOwnGalleryPhoto: async (write) => {
				written.push(write);
				return theirs;
			}
		}).services;

	it('captions the uploader’s photo and goes back to the Photos card', async () => {
		const written: CaptionWrite[] = [];
		expect(await post(actions.captionPhoto, captioning(true, written), formOf(caption))).toEqual({
			kind: 'redirect',
			status: 303,
			location: BACK_TO_PHOTOS
		});
		expect(written).toEqual([{ authorId: MEMBER.id, photoId: 'p1', caption: 'At the lake' }]);
	});

	it('refuses a form without the photo or the caption', async () => {
		for (const form of [formOf({ caption: 'x' }), formOf({ photoId: 'p1' })]) {
			expect(await post(actions.captionPhoto, captioning(true), form)).toEqual(
				refused(400, t('errors.caption.unreadable'))
			);
		}
	});

	it('answers 403 when the photo is someone else’s', async () => {
		expect(await post(actions.captionPhoto, captioning(false), formOf(caption))).toEqual(
			refused(403, t('errors.photo.onlyOwnerCaption'))
		);
	});

	it('says how long a caption may be, and writes nothing', async () => {
		const written: CaptionWrite[] = [];
		const form = formOf({ photoId: 'p1', caption: 'x'.repeat(CAPTION_MAX_LENGTH + 1) });
		expect(await post(actions.captionPhoto, captioning(true, written), form)).toEqual(
			refused(400, t('errors.caption.tooLong', { max: CAPTION_MAX_LENGTH }))
		);
		expect(written).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = galleryOver([], {
			updateOwnGalleryPhoto: async () => {
				throw new Error('disk full');
			}
		});
		await expect(post(actions.captionPhoto, services, formOf(caption))).rejects.toThrow(
			'disk full'
		);
	});
});

describe('setPhotoVisibility', () => {
	const share = { photoId: 'p1', visibility: 'shared' };
	const changing = (theirs: boolean) =>
		galleryOver([], { updateOwnGalleryPhoto: async () => theirs }).services;

	it('moves the uploader’s photo and goes back to the Photos card', async () => {
		expect(await post(actions.setPhotoVisibility, changing(true), formOf(share))).toEqual({
			kind: 'redirect',
			status: 303,
			location: BACK_TO_PHOTOS
		});
	});

	it('refuses a visibility it does not know, or no photo', async () => {
		for (const form of [
			formOf({ ...share, visibility: 'secret' }),
			formOf({ visibility: 'shared' })
		]) {
			expect(await post(actions.setPhotoVisibility, changing(true), form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 403 when the photo is someone else’s', async () => {
		expect(await post(actions.setPhotoVisibility, changing(false), formOf(share))).toEqual(
			refused(403, t('errors.photo.onlyOwnerChange'))
		);
	});
});

describe('pinPhoto', () => {
	const pin = { photoId: 'p1', pinned: 'true' };

	/** Anna's photo p1 as the viewer sees it; the pins written are the test's. */
	function pinning(contactId = 'anna') {
		const pins: [string, number | null][] = [];
		const { services } = galleryOver([someGalleryPhoto('p1', { contactId })], {
			setGalleryPhotoPin: async (id, at) => void pins.push([id, at])
		});
		return { services, pins };
	}

	it('pins the photo on this person and goes back to the Photos card', async () => {
		const { services, pins } = pinning();
		expect(await post(actions.pinPhoto, services, formOf(pin))).toEqual({
			kind: 'redirect',
			status: 303,
			location: BACK_TO_PHOTOS
		});
		expect(pins).toEqual([['p1', NOW]]);
	});

	it('refuses a pin that is neither on nor off', async () => {
		expect(
			await post(actions.pinPhoto, pinning().services, formOf({ ...pin, pinned: 'yes' }))
		).toEqual(refused(400, t('errors.photo.unreadable')));
	});

	it('answers 404 for a photo that is not this person’s', async () => {
		const { services, pins } = pinning('ben');
		expect(await post(actions.pinPhoto, services, formOf(pin))).toEqual(
			refused(404, t('errors.photo.notFound'))
		);
		expect(pins).toEqual([]);
	});
});

describe('framePhotoAsAvatar', () => {
	const square = {
		photoId: 'p1',
		image: jpeg('square.jpg'),
		thumb: jpeg('square-thumb.jpg'),
		cropX: '100',
		cropY: '50',
		cropSize: '400',
		width: '1024',
		height: '1024'
	};

	/** Anna's 1600×1200 photo p1, framed through ports that keep what they were handed. */
	function framing({
		photos = [someGalleryPhoto('p1', { contactId: 'anna' })],
		put = keepFile
	} = {}) {
		const framed: StoredFraming[] = [];
		const services: FakeServices = {
			media: {
				framingDeps: {
					gallery: inMemoryGalleryPhotos(photos),
					framings: { replaceFraming: async (f) => (framed.push(f), []) },
					media: { put, delete: async () => {} },
					ids: sequentialIds('f1'),
					clock: fixedClock(NOW)
				}
			}
		};
		return { services, framed };
	}

	it('wears the chosen square and goes back to the Photos card', async () => {
		const { services, framed } = framing();
		expect(await post(actions.framePhotoAsAvatar, services, formOf(square))).toEqual({
			kind: 'redirect',
			status: 303,
			location: BACK_TO_PHOTOS
		});
		expect(
			framed.map(({ framingOf, contactId, crop }) => ({ framingOf, contactId, crop }))
		).toEqual([{ framingOf: 'p1', contactId: 'anna', crop: { x: 100, y: 50, size: 400 } }]);
	});

	it('refuses a form without the photo or the rendered square', async () => {
		const { photoId: _, ...noPhoto } = square;
		const { thumb: __, ...noThumb } = square;
		for (const form of [formOf(noPhoto), formOf(noThumb)]) {
			expect(await post(actions.framePhotoAsAvatar, framing().services, form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 404 for a photo the viewer cannot see on this person', async () => {
		expect(
			await post(actions.framePhotoAsAvatar, framing({ photos: [] }).services, formOf(square))
		).toEqual(refused(404, t('errors.photo.notFound')));
	});

	it('says why the square was refused, in the reader’s words', async () => {
		const form = formOf({ ...square, cropX: '1400' });
		expect(await post(actions.framePhotoAsAvatar, framing().services, form)).toEqual(
			refused(400, t('errors.image.cropOutside'))
		);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const put = async (): Promise<string> => {
			throw new Error('disk full');
		};
		await expect(
			post(actions.framePhotoAsAvatar, framing({ put }).services, formOf(square))
		).rejects.toThrow('disk full');
	});
});

describe('cutFromGroupPhoto', () => {
	const cut = {
		photoId: 'g1',
		image: jpeg('cut.jpg'),
		thumb: jpeg('cut-thumb.jpg'),
		cropX: '10',
		cropY: '20',
		cropSize: '300',
		width: '1024',
		height: '1024'
	};
	const choir = someGroupPhoto('g1', { circleId: 'choir' });

	/** The circle photo and the person as the viewer sees them; the cuts kept are the test's. */
	function cutting({ group = choir as GroupPhoto | null, person = true, put = keepFile } = {}) {
		const cuts: StoredFraming[] = [];
		const services: FakeServices = {
			circles: {
				cutDeps: {
					cuts: cutRepositoryWith({
						findVisibleGroupPhoto: async (_viewer, id) => (group?.id === id ? group : null),
						replaceCut: async (c) => (cuts.push(c), [])
					}),
					contacts: {
						findByIdVisibleTo: async (_viewer, id) => (person ? ({ id } as Contact) : null)
					},
					media: { put, delete: async () => {} },
					ids: sequentialIds('c1'),
					clock: fixedClock(NOW)
				}
			}
		};
		return { services, cuts };
	}

	it('makes this person wear the cut, whoever the form names, and goes back to their page', async () => {
		const { services, cuts } = cutting();
		const form = formOf({ ...cut, contactId: 'someone-else' });
		expect(await post(actions.cutFromGroupPhoto, services, form)).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/contacts/anna'
		});
		expect(cuts.map(({ contactId, framingOf }) => ({ contactId, framingOf }))).toEqual([
			{ contactId: 'anna', framingOf: 'g1' }
		]);
	});

	it('refuses a square whose measures do not read, or without its rendering', async () => {
		const { image: _, ...noImage } = cut;
		for (const form of [formOf({ ...cut, cropX: 'left' }), formOf(noImage)]) {
			expect(await post(actions.cutFromGroupPhoto, cutting().services, form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 404 when the viewer cannot see the circle photo', async () => {
		expect(
			await post(actions.cutFromGroupPhoto, cutting({ group: null }).services, formOf(cut))
		).toEqual(refused(404, t('errors.photo.notFound')));
	});

	it('answers 404 when the viewer cannot see the person', async () => {
		expect(
			await post(actions.cutFromGroupPhoto, cutting({ person: false }).services, formOf(cut))
		).toEqual(refused(404, t('errors.photo.notFound')));
	});

	it('says why the cut was refused, in the reader’s words', async () => {
		const form = formOf({ ...cut, image: new File(['not a picture'], 'cut.jpg') });
		expect(await post(actions.cutFromGroupPhoto, cutting().services, form)).toEqual(
			refused(400, t('errors.image.unsupportedFormat'))
		);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const put = async (): Promise<string> => {
			throw new Error('disk full');
		};
		await expect(
			post(actions.cutFromGroupPhoto, cutting({ put }).services, formOf(cut))
		).rejects.toThrow('disk full');
	});
});

describe('removePhoto', () => {
	const removing = (theirs: boolean) =>
		galleryOver([], {
			findRemovableGalleryPhoto: async () =>
				theirs
					? {
							id: 'p1',
							contactId: 'c1',
							person: 'Mara',
							personVisibility: 'shared',
							authorId: 'u1',
							authorName: 'Ana'
						}
					: null,
			deleteRemovableGalleryPhoto: async () =>
				theirs ? [{ filePath: 'media/p1.jpg', thumbPath: 'media/p1_thumb.jpg' }] : null
		});

	it('removes the uploader’s photo and its files, and goes back to the Photos card', async () => {
		const { services, deleted } = removing(true);
		expect(await post(actions.removePhoto, services, formOf({ photoId: 'p1' }))).toEqual({
			kind: 'redirect',
			status: 303,
			location: BACK_TO_PHOTOS
		});
		expect(deleted).toEqual(['media/p1.jpg', 'media/p1_thumb.jpg']);
	});

	it('refuses a form without the photo', async () => {
		expect(await post(actions.removePhoto, removing(true).services, formOf({}))).toEqual(
			refused(400, t('errors.photo.unreadable'))
		);
	});

	it('answers 403 when the photo is someone else’s, and keeps its files', async () => {
		const { services, deleted } = removing(false);
		expect(await post(actions.removePhoto, services, formOf({ photoId: 'p1' }))).toEqual(
			refused(403, t('errors.photo.onlyOwnerRemove'))
		);
		expect(deleted).toEqual([]);
	});
});

describe('a visitor who is not signed in', () => {
	it('is sent to log in by every photo action, before anything is read', async () => {
		for (const [name, action] of Object.entries(actions)) {
			const event = routeEvent<never>({ services: {}, user: null, params: PAGE, form: formOf({}) });
			expect({ name, answer: await answerOf(action(event)) }).toEqual({
				name,
				answer: { kind: 'redirect', status: 302, location: '/login' }
			});
		}
	});
});
