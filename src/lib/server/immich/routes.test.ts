import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../access/visibility';
import type { ImmichGateway } from '../domain/immich/gateway';
import type { ImmichLinkRepository } from '../domain/immich/links';
import { BERT_AND_CARL_ID, BERT_ID, CARL_ID, testLibrary } from '../domain/immich/test-library';
import { faceUrlFor, GLIMPSE_PAGE_SIZE } from '../domain/immich/glimpse';
import { createImmichMediaSigner } from '../domain/immich/signed-media';
import { createFakeImmichGateway, fakeAssetId } from './fake-gateway';
import { answerFaceSearch, answerGlimpse, answerImmichMedia, IMMICH_MEDIA_CACHE_CONTROL } from './routes';

/*
 * What the Immich routes answer — the signed proxy `/media/immich/{token}`, the strip's
 * `/contacts/{id}/immich/photos` and the picker's `/contacts/{id}/immich/faces` — decided here
 * and only wired by their `+server.ts`. Every
 * refusal is checked against a gateway that records its calls, so "refused" also means
 * "Immich was never asked".
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

/** No links held: the picker's marking is covered by the use-case's own tests. */
const noLinks: ImmichLinkRepository = {
	findForContactVisibleTo: async () => null,
	holdersOf: async () => new Map(),
	save: async () => 'saved',
	remove: async () => false
};

const NOW = 1_700_000_000_000;
const clock = { now: () => NOW };
const signer = createImmichMediaSigner({ secret: 'test-secret', clock });

/** Bert is linked and visible; Carl is visible, not linked; nobody else is visible. */
const bertLinked: Pick<ImmichLinkRepository, 'findForContactVisibleTo'> = {
	findForContactVisibleTo: async (_viewer, contactId) =>
		contactId === 'c-bert' ? { contactId, immichPersonId: BERT_ID, linkedBy: 'u-anna', linkedAt: NOW } : null
};
const visibleContacts = {
	findByIdVisibleTo: async (_viewer: Viewer, id: string) =>
		id === 'c-bert' || id === 'c-carl' ? { displayName: id, visibility: 'shared' as const } : null
};

function mediaDeps(gateway: Pick<ImmichGateway, 'assetImage' | 'personThumbnail'> = createFakeImmichGateway(testLibrary())) {
	return { links: bertLinked, contacts: visibleContacts, gateway, signer };
}

const bertsPhoto = () =>
	signer.sign({ kind: 'photo', contactId: 'c-bert', personId: BERT_ID, assetId: fakeAssetId(BERT_ID, 0), size: 'thumbnail' });

describe('answerImmichMedia', () => {
	it('serves a signed photo with its image type, never kept by any cache and never sniffed', async () => {
		const answer = await answerImmichMedia(mediaDeps(), viewer, await bertsPhoto());

		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.status).toBe(200);
		expect(answer.headers.get('content-type')).toBe('image/png');
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
		expect(IMMICH_MEDIA_CACHE_CONTROL).toBe('private, no-store');
		expect(answer.headers.get('x-content-type-options')).toBe('nosniff');
		const bytes = new Uint8Array(await answer.arrayBuffer());
		expect(answer.headers.get('content-length')).toBe(String(bytes.byteLength));
		expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // "PNG"
	});

	it('serves a signed face the same way', async () => {
		const token = (await faceUrlFor(signer, 'c-carl', CARL_ID)).split('/').at(-1) ?? '';
		const answer = await answerImmichMedia(mediaDeps(), viewer, token);
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
	});

	it('refuses a visitor who is not signed in, without asking Immich', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		expect(await answerImmichMedia(mediaDeps(gateway), null, await bertsPhoto())).toEqual({
			status: 401,
			message: 'errors.notSignedIn'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('answers 404 for a bare id, a tampered or expired token, an invisible or unlinked person — never asking Immich', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const token = await bertsPhoto();
		const expired = await createImmichMediaSigner({ secret: 'test-secret', clock: { now: () => NOW - 2 * 86_400_000 } }).sign({
			kind: 'photo',
			contactId: 'c-bert',
			personId: BERT_ID,
			assetId: fakeAssetId(BERT_ID, 0),
			size: 'thumbnail'
		});
		const invisible = await signer.sign({ kind: 'face', contactId: 'c-dora', personId: BERT_ID });
		const unlinked = await signer.sign({
			kind: 'photo',
			contactId: 'c-carl',
			personId: CARL_ID,
			assetId: fakeAssetId(CARL_ID, 0),
			size: 'preview'
		});
		for (const raw of [BERT_ID, '..', '', `${token}x`, expired, invisible, unlinked]) {
			expect(await answerImmichMedia(mediaDeps(gateway), viewer, raw)).toEqual({ status: 404, message: 'errors.notFound' });
		}
		expect(gateway.calls).toEqual([]);
	});

	it('answers 404 when this instance has no Immich', async () => {
		expect(await answerImmichMedia(null, viewer, await bertsPhoto())).toEqual({ status: 404, message: 'errors.notFound' });
	});

	it('answers 404 for a photo Immich no longer has, and 502 when Immich failed', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.library.people = [];
		expect(await answerImmichMedia(mediaDeps(gateway), viewer, await bertsPhoto())).toMatchObject({ status: 404 });

		const down = createFakeImmichGateway(testLibrary());
		down.failing = { assetImage: 'unreachable' };
		expect(await answerImmichMedia(mediaDeps(down), viewer, await bertsPhoto())).toMatchObject({ status: 502 });
	});

	it('never passes on bytes that are not an ordinary image, whatever the gateway let through', async () => {
		for (const contentType of ['text/html', 'image/svg+xml', 'application/octet-stream']) {
			const bad = async () => ({
				ok: true as const,
				value: { bytes: new TextEncoder().encode('<script>x()</script>'), contentType }
			});
			expect(
				await answerImmichMedia(mediaDeps({ assetImage: bad, personThumbnail: bad }), viewer, await bertsPhoto())
			).toEqual({ status: 502, message: 'errors.notFound' });
		}
	});
});

describe('answerGlimpse', () => {
	function glimpseDeps() {
		const gateway = createFakeImmichGateway(testLibrary());
		return { gateway, deps: { links: bertLinked, gateway, signer, publicUrl: 'https://immich.example.com' } };
	}

	it('answers the strip as JSON that no cache keeps', async () => {
		const { deps: d } = glimpseDeps();
		const answer = await answerGlimpse(d, viewer, 'c-bert', null);
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
		const body = await answer.json();
		expect(body.state).toBe('photos');
		expect(body.photos).toHaveLength(GLIMPSE_PAGE_SIZE);
	});

	it('refuses a visitor who is not signed in, and a person not linked or not visible, without asking Immich', async () => {
		const { deps: d, gateway } = glimpseDeps();
		expect(await answerGlimpse(d, null, 'c-bert', null)).toEqual({ status: 401, message: 'errors.notSignedIn' });
		for (const contactId of ['c-carl', 'c-dora']) {
			expect(await answerGlimpse(d, viewer, contactId, null)).toEqual({ status: 404, message: 'errors.notFound' });
		}
		expect(gateway.calls).toEqual([]);
	});

	it('answers the photos two linked people are in together, and 404 for a pair it may not show', async () => {
		const { deps: d, gateway } = glimpseDeps();
		expect(await answerGlimpse(d, viewer, 'c-bert', null, 'c-carl')).toEqual({ status: 404, message: 'errors.notFound' });
		expect(gateway.calls).toEqual([]);

		const bothLinked = {
			...d,
			links: {
				findForContactVisibleTo: async (_viewer: Viewer, contactId: string) =>
					contactId === 'c-bert' || contactId === 'c-carl'
						? { contactId, immichPersonId: contactId === 'c-bert' ? BERT_ID : CARL_ID, linkedBy: 'u-anna', linkedAt: NOW }
						: null
			}
		};
		const answer = await answerGlimpse(bothLinked, viewer, 'c-bert', null, 'c-carl');
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
		const body = await answer.json();
		expect(body.photos[0].id).toBe(fakeAssetId(BERT_AND_CARL_ID, 0));
	});

	it('answers 404 when this instance has no Immich', async () => {
		expect(await answerGlimpse(null, viewer, 'c-bert', null)).toEqual({ status: 404, message: 'errors.notFound' });
	});

	it('says in the body that Immich did not answer, rather than failing the request', async () => {
		const { deps: d, gateway } = glimpseDeps();
		gateway.failing = { latestAssets: 'unreachable' };
		const answer = await answerGlimpse(d, viewer, 'c-bert', null);
		if (!(answer instanceof Response)) throw new Error('refused');
		expect(await answer.json()).toEqual({ state: 'unreachable' });
	});
});

describe('answerFaceSearch', () => {
	const deps = (over: Partial<Parameters<typeof answerFaceSearch>[0]> = {}) => {
		const gateway = createFakeImmichGateway(testLibrary());
		return {
			gateway,
			deps: {
				immich: { gateway, links: noLinks, signer },
				isContactVisible: async (_viewer: Viewer, id: string) => id === 'c-bert',
				// The key itself, so a test reads which sentence was chosen.
				say: (key: string) => key,
				...over
			}
		};
	};

	it('answers the faces as JSON, each with whether it is linked already', async () => {
		const { deps: d } = deps();
		const answer = await answerFaceSearch(d, viewer, 'c-bert', 'example');
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('content-type')).toContain('application/json');
		const body: unknown = await answer.json();
		expect(body).toEqual({
			faces: [
				{ id: BERT_ID, name: 'Bert Example', linkedTo: null, faceUrl: expect.stringMatching(/^\/media\/immich\//) },
				{ id: CARL_ID, name: 'Carl Example', linkedTo: null, faceUrl: expect.stringMatching(/^\/media\/immich\//) }
			],
			error: null
		});
	});

	it('signs each face for the person the picker is for, and for nothing else', async () => {
		const { deps: d } = deps();
		const answer = await answerFaceSearch(d, viewer, 'c-bert', 'example');
		if (!(answer instanceof Response)) throw new Error('refused');
		const { faces } = (await answer.json()) as { faces: { id: string; faceUrl: string }[] };
		for (const face of faces) {
			expect(await signer.verify(face.faceUrl.split('/').at(-1) ?? '')).toEqual({
				ok: true,
				media: { kind: 'face', contactId: 'c-bert', personId: face.id, expiresAt: expect.any(Number) }
			});
		}
	});

	it('refuses a visitor who is not signed in, without asking Immich', async () => {
		const { deps: d, gateway } = deps();
		expect(await answerFaceSearch(d, null, 'c-bert', 'x')).toEqual({ status: 401, message: 'errors.notSignedIn' });
		expect(gateway.calls).toEqual([]);
	});

	it('answers 404 when this instance has no Immich', async () => {
		const { deps: d } = deps({ immich: null });
		expect(await answerFaceSearch(d, viewer, 'c-bert', 'x')).toEqual({ status: 404, message: 'errors.notFound' });
	});

	it('answers 404 for a person the member cannot see, without asking Immich', async () => {
		const { deps: d, gateway } = deps();
		expect(await answerFaceSearch(d, viewer, 'c-private', 'x')).toEqual({
			status: 404,
			message: 'errors.contact.notFound'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('says what went wrong in Immich, in the body, rather than failing the request', async () => {
		const { deps: d, gateway } = deps();
		gateway.failing = { searchPeople: 'unauthorized' };
		const answer = await answerFaceSearch(d, viewer, 'c-bert', 'x');
		if (!(answer instanceof Response)) throw new Error('refused');
		expect(await answer.json()).toEqual({ faces: [], error: 'immich.error.keyRejected' });
	});
});
