import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../access/visibility';
import type { ImmichGateway } from '../domain/immich/gateway';
import type { ImmichLinkRepository } from '../domain/immich/links';
import { BERT_ID, CARL_ID, testLibrary } from '../domain/immich/test-library';
import { createFakeImmichGateway } from './fake-gateway';
import { answerFaceSearch, answerFaceThumbnail, FACE_CACHE_CONTROL } from './routes';

/*
 * What the two Immich routes answer — `/media/immich/people/{id}/thumbnail` and
 * `/contacts/{id}/immich/faces` — decided here and only wired by their `+server.ts`. Every
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

describe('answerFaceThumbnail', () => {
	it('serves the face with its image type, privately cached for a day and never sniffed', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const answer = await answerFaceThumbnail({ gateway }, viewer, BERT_ID);

		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.status).toBe(200);
		expect(answer.headers.get('content-type')).toBe('image/png');
		expect(answer.headers.get('cache-control')).toBe(FACE_CACHE_CONTROL);
		expect(FACE_CACHE_CONTROL).toBe('private, max-age=86400');
		expect(answer.headers.get('x-content-type-options')).toBe('nosniff');
		const bytes = new Uint8Array(await answer.arrayBuffer());
		expect(answer.headers.get('content-length')).toBe(String(bytes.byteLength));
		expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // "PNG"
	});

	it('refuses a visitor who is not signed in, without asking Immich', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		expect(await answerFaceThumbnail({ gateway }, null, BERT_ID)).toEqual({
			status: 401,
			message: 'errors.notSignedIn'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('answers 404 for anything that is not an Immich id, without asking Immich', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		for (const id of ['anna', '..', `${BERT_ID}x`, '']) {
			expect(await answerFaceThumbnail({ gateway }, viewer, id)).toEqual({ status: 404, message: 'errors.notFound' });
		}
		expect(gateway.calls).toEqual([]);
	});

	it('answers 404 when this instance has no Immich', async () => {
		expect(await answerFaceThumbnail(null, viewer, BERT_ID)).toEqual({ status: 404, message: 'errors.notFound' });
	});

	it('answers 404 for a person Immich no longer has, and 502 when Immich failed', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.library.people = [];
		expect(await answerFaceThumbnail({ gateway }, viewer, BERT_ID)).toMatchObject({ status: 404 });

		const down = createFakeImmichGateway(testLibrary());
		down.failing = { personThumbnail: 'unreachable' };
		expect(await answerFaceThumbnail({ gateway: down }, viewer, BERT_ID)).toMatchObject({ status: 502 });
	});

	it('never passes on bytes that are not an ordinary image, whatever the gateway let through', async () => {
		for (const contentType of ['text/html', 'image/svg+xml', 'application/octet-stream']) {
			const gateway: Pick<ImmichGateway, 'personThumbnail'> = {
				personThumbnail: async () => ({
					ok: true,
					value: { bytes: new TextEncoder().encode('<script>x()</script>'), contentType }
				})
			};
			expect(await answerFaceThumbnail({ gateway }, viewer, BERT_ID)).toEqual({
				status: 502,
				message: 'errors.notFound'
			});
		}
	});
});

describe('answerFaceSearch', () => {
	const deps = (over: Partial<Parameters<typeof answerFaceSearch>[0]> = {}) => {
		const gateway = createFakeImmichGateway(testLibrary());
		return {
			gateway,
			deps: {
				immich: { gateway, links: noLinks },
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
		expect(await answer.json()).toEqual({
			faces: [
				{ id: BERT_ID, name: 'Bert Example', linkedTo: null },
				{ id: CARL_ID, name: 'Carl Example', linkedTo: null }
			],
			error: null
		});
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
