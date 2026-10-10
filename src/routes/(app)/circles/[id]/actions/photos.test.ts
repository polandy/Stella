import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type {
	CirclePhoto,
	CirclePhotoDescription,
	CirclePhotoRepository
} from '$lib/server/domain/circles/circle-photos';
import type { Contact } from '$lib/server/domain/contacts/contacts';
import type { GroupPhoto } from '$lib/server/domain/media/cuts';
import type { StoredFraming } from '$lib/server/domain/media/framing';
import { CAPTION_MAX_LENGTH } from '$lib/server/domain/media/gallery';
import {
	circleRepositoryWith,
	cutRepositoryWith,
	fixedClock,
	inMemoryCircleMemberships,
	membership,
	sequentialIds,
	someCircle,
	someGroupPhoto,
	type FakeMembership
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
 * The circle lightbox's actions (docs/02 §2.4.2) as the edge answers them: the circle the address
 * names, the form read, a photo that is not there or not the viewer's, a refusal of the use-case
 * said in the reader's language, and a save that answers with data so the lightbox stays open.
 * The use-cases have their own suites; the ports here only answer the way the case needs.
 */

const t = createTranslator('en');
const PAGE = { id: 'k1' };
const NOW = 5000;

/** What a save answers: the lightbox stays open on the photo. */
const SAVED: EdgeAnswer = { kind: 'data', data: { photoSaved: true } };

/** A JPEG as far as sniffing the bytes goes. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const jpeg = (name: string) => new File([JPEG], name);

/** A media store's put that keeps every file it is handed. */
const keepFile = async (key: string) => `media/${key}`;

/** Runs `action` on the circle's page with `form` posted, over `services`. */
const post = (action: (event: never) => Promise<unknown>, services: FakeServices, form: FormData) =>
	answerOf(action(routeEvent({ services, params: PAGE, form })));

/** The 400, 403 or 404 an action answers with the sentence under the photo. */
const refused = (status: number, sentence: string): EdgeAnswer => ({
	kind: 'fail',
	status,
	data: { photoError: sentence }
});

/** A shared photo of the circle without a role, added by the signed-in member. */
const photo = (id: string, fields: Partial<CirclePhoto> = {}): CirclePhoto => ({
	id,
	circleId: 'k1',
	role: null,
	caption: null,
	visibility: 'shared',
	createdBy: MEMBER.id,
	createdByName: MEMBER.name,
	width: 2000,
	height: 1500,
	takenAt: null,
	createdAt: 1000,
	pinnedAt: null,
	...fields
});

interface Household {
	/** Whether the viewer can see circle k1. */
	circle?: boolean;
	/** The circle's photos the viewer sees. */
	photos?: CirclePhoto[];
	members?: FakeMembership[];
	/** The photo a cut is made from, as the viewer sees it. */
	group?: GroupPhoto | null;
	/** Whether the viewer sees the person a cut is for. */
	person?: boolean;
	put?: (key: string, bytes: Uint8Array) => Promise<string>;
	describe?: CirclePhotoRepository['describe'];
}

/** The circle page's ports over what the viewer sees; the writes are kept for the test. */
function household({
	circle = true,
	photos = [photo('p1')],
	members = [],
	group = someGroupPhoto('g1'),
	person = true,
	put = keepFile,
	describe
}: Household = {}) {
	const described: [string, CirclePhotoDescription][] = [];
	const rescoped: string[] = [];
	const deleted: string[] = [];
	const cuts: StoredFraming[] = [];
	const unexpected = async (): Promise<never> => {
		throw new Error('not expected in this test');
	};
	const seen = (circleId: string, photoId: string) =>
		photos.find((p) => p.id === photoId && p.circleId === circleId);
	const own = (input: { authorId: string; circleId: string; photoId: string }) =>
		seen(input.circleId, input.photoId)?.createdBy === input.authorId;

	const circles = circleRepositoryWith({
		getVisibleTo: async (_viewer, id) => (circle && id === 'k1' ? someCircle('k1', 'Choir') : null)
	});
	const circlePhotos: CirclePhotoRepository = {
		findVisible: async (_viewer, circleId, photoId) => seen(circleId, photoId) ?? null,
		describe: describe ?? (async (id, changes) => void described.push([id, changes])),
		setOwnVisibility: async (input) => own(input) && (rescoped.push(input.photoId), true),
		findRemovable: async (remover, ref) =>
			own({ authorId: remover.id, ...ref })
				? {
						id: ref.photoId,
						contactId: null,
						person: 'Choir',
						personVisibility: 'shared',
						authorId: 'u1',
						authorName: 'Ana'
					}
				: null,
		deleteRemovable: async (remover, input) =>
			own({ authorId: remover.id, ...input })
				? {
						filePath: `media/${input.photoId}.jpg`,
						thumbPath: `media/${input.photoId}_thumb.jpg`,
						viewPath: `media/${input.photoId}_view.jpg`
					}
				: null,
		insert: unexpected,
		listVisible: unexpected,
		listCoverCandidates: unexpected
	};
	const media = { put, delete: async (path: string) => void deleted.push(path) };
	const services: FakeServices = {
		circles: {
			circleDeps: { circles, ids: sequentialIds(), clock: fixedClock(NOW) },
			circlePhotoDeps: {
				circlePhotos,
				circles,
				memberships: inMemoryCircleMemberships(members),
				media,
				ids: sequentialIds(),
				clock: fixedClock(NOW)
			},
			cutDeps: {
				cuts: cutRepositoryWith({
					findVisibleGroupPhoto: async (_viewer, id) => (group?.id === id ? group : null),
					replaceCut: async (c) => (cuts.push(c), [])
				}),
				contacts: {
					findByIdVisibleTo: async (_viewer, id) => (person ? ({ id } as Contact) : null)
				},
				media,
				ids: sequentialIds('c1'),
				clock: fixedClock(NOW)
			}
		}
	};
	return { services, described, rescoped, deleted, cuts };
}

const breakage = async () => {
	throw new Error('disk full');
};

describe('captionPhoto', () => {
	const caption = { photoId: 'p1', caption: '  At the lake  ' };

	it('captions the photo and answers with the save, keeping the lightbox open', async () => {
		const { services, described } = household();
		expect(await post(actions.captionPhoto, services, formOf(caption))).toEqual(SAVED);
		expect(described).toEqual([['p1', { caption: 'At the lake' }]]);
	});

	it('refuses a form without the photo or the caption', async () => {
		for (const form of [formOf({ caption: 'x' }), formOf({ photoId: 'p1' })]) {
			expect(await post(actions.captionPhoto, household().services, form)).toEqual(
				refused(400, t('errors.caption.unreadable'))
			);
		}
	});

	it('answers 404 for a photo the viewer cannot see in this circle', async () => {
		const { services, described } = household({ photos: [photo('p1', { circleId: 'k2' })] });
		expect(await post(actions.captionPhoto, services, formOf(caption))).toEqual(
			refused(404, t('errors.photo.notFound'))
		);
		expect(described).toEqual([]);
	});

	it('says how long a caption may be, and writes nothing', async () => {
		const { services, described } = household();
		const form = formOf({ photoId: 'p1', caption: 'x'.repeat(CAPTION_MAX_LENGTH + 1) });
		expect(await post(actions.captionPhoto, services, form)).toEqual(
			refused(400, t('errors.caption.tooLong', { max: CAPTION_MAX_LENGTH }))
		);
		expect(described).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({ describe: breakage });
		await expect(post(actions.captionPhoto, services, formOf(caption))).rejects.toThrow(
			'disk full'
		);
	});
});

describe('setPhotoRole', () => {
	const members = [membership('k1', 'anna', { role: 'host' })];

	it('gives the photo one of the circle’s roles, as the circle spells it', async () => {
		const { services, described } = household({ members });
		const form = formOf({ photoId: 'p1', role: 'Host' });
		expect(await post(actions.setPhotoRole, services, form)).toEqual(SAVED);
		expect(described).toEqual([['p1', { role: 'host' }]]);
	});

	it('reads a form without a role as no role', async () => {
		const { services, described } = household({
			members,
			photos: [photo('p1', { role: 'host' })]
		});
		expect(await post(actions.setPhotoRole, services, formOf({ photoId: 'p1' }))).toEqual(SAVED);
		expect(described).toEqual([['p1', { role: null }]]);
	});

	it('refuses a form without the photo', async () => {
		expect(
			await post(actions.setPhotoRole, household({ members }).services, formOf({ role: 'host' }))
		).toEqual(refused(400, t('errors.photo.unreadable')));
	});

	it('answers 404 for a photo the viewer cannot see in this circle', async () => {
		const form = formOf({ photoId: 'p2', role: 'host' });
		expect(await post(actions.setPhotoRole, household({ members }).services, form)).toEqual(
			refused(404, t('errors.photo.notFound'))
		);
	});

	it('says a role is picked from the circle’s, and writes nothing', async () => {
		const { services, described } = household({ members });
		const form = formOf({ photoId: 'p1', role: 'guest' });
		expect(await post(actions.setPhotoRole, services, form)).toEqual(
			refused(400, t('errors.circlePhoto.unknownRole'))
		);
		expect(described).toEqual([]);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		const { services } = household({ members, describe: breakage });
		const form = formOf({ photoId: 'p1', role: 'host' });
		await expect(post(actions.setPhotoRole, services, form)).rejects.toThrow('disk full');
	});
});

describe('pinPhoto', () => {
	it('pins the photo now and answers with the save', async () => {
		const { services, described } = household();
		const form = formOf({ photoId: 'p1', pinned: 'true' });
		expect(await post(actions.pinPhoto, services, form)).toEqual(SAVED);
		expect(described).toEqual([['p1', { pinnedAt: NOW }]]);
	});

	it('unpins a pinned photo', async () => {
		const { services, described } = household({ photos: [photo('p1', { pinnedAt: 1 })] });
		const form = formOf({ photoId: 'p1', pinned: 'false' });
		expect(await post(actions.pinPhoto, services, form)).toEqual(SAVED);
		expect(described).toEqual([['p1', { pinnedAt: null }]]);
	});

	it('refuses a pin that is neither on nor off, or no photo', async () => {
		for (const form of [formOf({ photoId: 'p1', pinned: 'yes' }), formOf({ pinned: 'true' })]) {
			expect(await post(actions.pinPhoto, household().services, form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 404 for a photo the viewer cannot see in this circle', async () => {
		const form = formOf({ photoId: 'p2', pinned: 'true' });
		expect(await post(actions.pinPhoto, household().services, form)).toEqual(
			refused(404, t('errors.photo.notFound'))
		);
	});
});

describe('setPhotoVisibility', () => {
	const hide = { photoId: 'p1', visibility: 'private' };

	it('moves the uploader’s photo and answers with the save', async () => {
		const { services, rescoped } = household();
		expect(await post(actions.setPhotoVisibility, services, formOf(hide))).toEqual(SAVED);
		expect(rescoped).toEqual(['p1']);
	});

	it('refuses a visibility it does not know, or no photo', async () => {
		for (const form of [
			formOf({ ...hide, visibility: 'secret' }),
			formOf({ visibility: 'private' })
		]) {
			expect(await post(actions.setPhotoVisibility, household().services, form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 403 when someone else added the photo', async () => {
		const { services, rescoped } = household({ photos: [photo('p1', { createdBy: 'u2' })] });
		expect(await post(actions.setPhotoVisibility, services, formOf(hide))).toEqual(
			refused(403, t('errors.photo.onlyOwnerChange'))
		);
		expect(rescoped).toEqual([]);
	});
});

describe('cutProfilePicture', () => {
	const cut = {
		photoId: 'g1',
		contactId: 'anna',
		image: jpeg('cut.jpg'),
		thumb: jpeg('cut-thumb.jpg'),
		cropX: '10',
		cropY: '20',
		cropSize: '300',
		width: '1024',
		height: '1024'
	};

	it('makes the person wear the cut and answers whom it was for, to offer the next', async () => {
		const { services, cuts } = household();
		expect(await post(actions.cutProfilePicture, services, formOf(cut))).toEqual({
			kind: 'data',
			data: { cutFor: 'anna' }
		});
		expect(cuts.map(({ contactId, framingOf, crop }) => ({ contactId, framingOf, crop }))).toEqual([
			{ contactId: 'anna', framingOf: 'g1', crop: { x: 10, y: 20, size: 300 } }
		]);
	});

	it('refuses a cut without the person, its rendering, or measures that read', async () => {
		const { contactId: _, ...noPerson } = cut;
		const { thumb: __, ...noThumb } = cut;
		for (const form of [formOf(noPerson), formOf(noThumb), formOf({ ...cut, cropX: 'left' })]) {
			expect(await post(actions.cutProfilePicture, household().services, form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 404 when the viewer cannot see the circle photo', async () => {
		const { services, cuts } = household({ group: null });
		expect(await post(actions.cutProfilePicture, services, formOf(cut))).toEqual(
			refused(404, t('errors.photo.notFound'))
		);
		expect(cuts).toEqual([]);
	});

	it('answers 404 when the viewer cannot see the person', async () => {
		expect(
			await post(actions.cutProfilePicture, household({ person: false }).services, formOf(cut))
		).toEqual(refused(404, t('errors.photo.notFound')));
	});

	it('says why the square was refused, in the reader’s words', async () => {
		const outside = formOf({ ...cut, cropX: '1900' });
		expect(await post(actions.cutProfilePicture, household().services, outside)).toEqual(
			refused(400, t('errors.image.cropOutside'))
		);
		const notAPicture = formOf({ ...cut, image: new File(['not a picture'], 'cut.jpg') });
		expect(await post(actions.cutProfilePicture, household().services, notAPicture)).toEqual(
			refused(400, t('errors.image.unsupportedFormat'))
		);
	});

	it('lets a breakage of ours through, for handleError to log', async () => {
		await expect(
			post(actions.cutProfilePicture, household({ put: breakage }).services, formOf(cut))
		).rejects.toThrow('disk full');
	});
});

describe('removePhoto', () => {
	it('removes the uploader’s photo with all three of its files, and answers with the save', async () => {
		const { services, deleted } = household();
		expect(await post(actions.removePhoto, services, formOf({ photoId: 'p1' }))).toEqual(SAVED);
		expect(deleted).toEqual(['media/p1.jpg', 'media/p1_thumb.jpg', 'media/p1_view.jpg']);
	});

	it('refuses a form without the photo', async () => {
		for (const form of [formOf({}), formOf({ photoId: '' })]) {
			expect(await post(actions.removePhoto, household().services, form)).toEqual(
				refused(400, t('errors.photo.unreadable'))
			);
		}
	});

	it('answers 403 when someone else added the photo, and keeps its files', async () => {
		const { services, deleted } = household({ photos: [photo('p1', { createdBy: 'u2' })] });
		expect(await post(actions.removePhoto, services, formOf({ photoId: 'p1' }))).toEqual(
			refused(403, t('errors.photo.onlyOwnerRemove'))
		);
		expect(deleted).toEqual([]);
	});
});

describe('a circle the viewer cannot see', () => {
	it('is not found by every photo action, before the form is read', async () => {
		for (const [name, action] of Object.entries(actions)) {
			const { services, described, rescoped, deleted, cuts } = household({ circle: false });
			const answer = await post(action, services, formOf({}));
			expect({ name, answer, writes: [described, rescoped, deleted, cuts].flat() }).toEqual({
				name,
				answer: { kind: 'error', status: 404, message: t('errors.circle.notFound') },
				writes: []
			});
		}
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
