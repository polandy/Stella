import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { createFakeImmichGateway, fakeAssetId } from '../../immich/fake-gateway';
import {
	faceUrlFor,
	GLIMPSE_PAGE_SIZE,
	newcomerFaceUrl,
	openImmichMedia,
	readImmichGlimpse,
	readTogetherOffers,
	type ImmichGlimpseDeps,
	type ImmichMediaDeps
} from './glimpse';
import type { ImmichLink } from './links';
import {
	createImmichMediaSigner,
	IMMICH_MEDIA_TTL_MS,
	type ImmichMediaSigner
} from './signed-media';
import { BERT_AND_CARL_ID, BERT_ID, CARL_ID, DORA_ID, testLibrary } from './test-library';

/*
 * The glimpse of a linked person's photos (docs/02 §2.24.3, §2.24.4): the strip's signed
 * URLs, and what the proxy serves for one. Every refusal is checked against a gateway that
 * records its calls, so "refused" also means "Immich was never asked".
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const PUBLIC_URL = 'https://immich.example.com';
const NOW = 1_700_000_000_000;

function fakeClock(): Clock & { advance(ms: number): void } {
	let now = NOW;
	return { now: () => now, advance: (ms) => void (now += ms) };
}

/**
 * The household as the viewer sees it: Bert is linked to his Immich person and visible, Carl is
 * visible and not linked, Dora is linked but private to someone else — out of the viewer's reach —
 * and Cleo, visible, is linked to the Immich person Bert shares photos with.
 */
function household() {
	const visible = new Set(['c-bert', 'c-carl', 'c-cleo']);
	const links = new Map<string, ImmichLink>([
		['c-bert', { contactId: 'c-bert', immichPersonId: BERT_ID, linkedBy: 'u-anna', linkedAt: NOW }],
		['c-dora', { contactId: 'c-dora', immichPersonId: DORA_ID, linkedBy: 'u-bert', linkedAt: NOW }],
		['c-cleo', { contactId: 'c-cleo', immichPersonId: CARL_ID, linkedBy: 'u-anna', linkedAt: NOW }]
	]);
	return {
		visible,
		links,
		repository: {
			findForContactVisibleTo: async (_viewer: Viewer, contactId: string) =>
				visible.has(contactId) ? (links.get(contactId) ?? null) : null,
			holdersOf: async (_viewer: Viewer, personIds: readonly string[]) =>
				new Map(
					[...links.values()]
						.filter((link) => personIds.includes(link.immichPersonId))
						.map((link) => [link.immichPersonId, { contactId: link.contactId, name: null }])
				)
		},
		contacts: {
			findByIdVisibleTo: async (_viewer: Viewer, id: string) =>
				visible.has(id) ? { displayName: id, visibility: 'shared' as const } : null
		}
	};
}

function setup() {
	const clock = fakeClock();
	const gateway = createFakeImmichGateway(testLibrary());
	const signer = createImmichMediaSigner({ secret: 'test-secret', clock });
	const home = household();
	const glimpseDeps: ImmichGlimpseDeps = {
		links: home.repository,
		gateway,
		signer,
		publicUrl: PUBLIC_URL
	};
	const mediaDeps: ImmichMediaDeps = {
		links: home.repository,
		contacts: home.contacts,
		gateway,
		signer
	};
	return { clock, gateway, signer, home, glimpseDeps, mediaDeps };
}

/** The token at the end of a signed media URL. */
const tokenOf = (url: string) => url.split('/').at(-1) ?? '';

describe('readImmichGlimpse', () => {
	it('gives the latest twelve photos, newest first, each with signed thumbnail and preview URLs', async () => {
		const { glimpseDeps, signer } = setup();
		const glimpse = await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null);
		if (glimpse?.state !== 'photos') throw new Error(`no photos: ${JSON.stringify(glimpse)}`);

		expect(glimpse.photos).toHaveLength(GLIMPSE_PAGE_SIZE);
		expect(glimpse.photos.map((photo) => photo.id)).toEqual(
			Array.from({ length: GLIMPSE_PAGE_SIZE }, (_, index) => fakeAssetId(BERT_ID, index))
		);
		expect(glimpse.nextCursor).not.toBeNull();

		const [first] = glimpse.photos;
		expect(first.thumbnailUrl).toStartWith('/media/immich/');
		expect(await signer.verify(tokenOf(first.thumbnailUrl))).toEqual({
			ok: true,
			media: {
				kind: 'photo',
				contactId: 'c-bert',
				personId: BERT_ID,
				assetId: first.id,
				size: 'thumbnail',
				expiresAt: NOW + IMMICH_MEDIA_TTL_MS
			}
		});
		expect(await signer.verify(tokenOf(first.previewUrl))).toMatchObject({
			ok: true,
			media: { size: 'preview' }
		});
		expect(first.openUrl).toBe(`${PUBLIC_URL}/photos/${first.id}`);
		expect(first.takenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('signs when a photo was taken into its preview, the picture *Use as photo* starts from', async () => {
		const { glimpseDeps, signer, gateway } = setup();
		const glimpse = await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null);
		if (glimpse?.state !== 'photos') throw new Error(`no photos: ${JSON.stringify(glimpse)}`);
		const [first] = glimpse.photos;
		const listed = await gateway.latestAssets({ personIds: [BERT_ID], match: 'any' }, 1, null);
		if (!listed.ok) throw new Error('the fake did not list');
		const takenAt = listed.value.assets[0].takenAt;
		expect(takenAt).not.toBeNull();

		expect(await signer.verify(tokenOf(first.previewUrl))).toMatchObject({
			ok: true,
			media: { takenAt }
		});
		expect(first.takenOn).toBe(takenAt!.slice(0, 10));
		const thumbnail = await signer.verify(tokenOf(first.thumbnailUrl));
		expect(thumbnail.ok && 'takenAt' in thumbnail.media).toBe(false);
	});

	it('goes on from where the last page ended, and says when there is no more', async () => {
		const { glimpseDeps } = setup();
		// Carl has seven photos: one short page, and nothing after it.
		glimpseDeps.links = {
			findForContactVisibleTo: async () => ({
				contactId: 'c-bert',
				immichPersonId: CARL_ID,
				linkedBy: 'u',
				linkedAt: NOW
			})
		};
		const first = await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null);
		expect(first).toMatchObject({ state: 'photos', nextCursor: null });
		if (first?.state !== 'photos') throw new Error('no photos');
		expect(first.photos).toHaveLength(7);

		const { glimpseDeps: bertDeps } = setup();
		const page1 = await readImmichGlimpse(bertDeps, viewer, 'c-bert', null);
		if (page1?.state !== 'photos' || page1.nextCursor === null) throw new Error('no second page');
		const page2 = await readImmichGlimpse(bertDeps, viewer, 'c-bert', page1.nextCursor);
		if (page2?.state !== 'photos') throw new Error('no second page');
		expect(page2.photos[0].id).toBe(fakeAssetId(BERT_ID, GLIMPSE_PAGE_SIZE));
	});

	it('gives nothing for a person the viewer cannot see, without asking Immich', async () => {
		const { glimpseDeps, gateway } = setup();
		expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-dora', null)).toBeNull();
		expect(gateway.calls).toEqual([]);
	});

	it('gives nothing for a person who is not linked, without asking Immich', async () => {
		const { glimpseDeps, gateway } = setup();
		expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-carl', null)).toBeNull();
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a cursor that is not one, without asking Immich', async () => {
		const { glimpseDeps, gateway } = setup();
		expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', 'x'.repeat(5000))).toEqual({
			state: 'photos',
			photos: [],
			nextCursor: null
		});
		expect(gateway.calls).toEqual([]);
	});

	it('says when the person is gone from Immich, and when Immich did not answer', async () => {
		const gone = setup();
		gone.gateway.library.people = gone.gateway.library.people.filter(
			(person) => person.id !== BERT_ID
		);
		expect(await readImmichGlimpse(gone.glimpseDeps, viewer, 'c-bert', null)).toEqual({
			state: 'personGone'
		});

		const down = setup();
		down.gateway.failing = { latestAssets: 'unreachable' };
		expect(await readImmichGlimpse(down.glimpseDeps, viewer, 'c-bert', null)).toEqual({
			state: 'unreachable'
		});

		const unscoped = setup();
		unscoped.gateway.failing = { latestAssets: 'forbidden' };
		expect(await readImmichGlimpse(unscoped.glimpseDeps, viewer, 'c-bert', null)).toEqual({
			state: 'unreachable'
		});
	});
});

describe('readImmichGlimpse together', () => {
	it('gives the photos both are in, each signed for both of them', async () => {
		const { glimpseDeps, signer, gateway } = setup();
		const glimpse = await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null, 'c-cleo');
		if (glimpse?.state !== 'photos') throw new Error(`no photos: ${JSON.stringify(glimpse)}`);

		expect(glimpse.photos.map((photo) => photo.id)).toEqual(
			Array.from({ length: GLIMPSE_PAGE_SIZE }, (_, index) => fakeAssetId(BERT_AND_CARL_ID, index))
		);
		expect(await signer.verify(tokenOf(glimpse.photos[0].previewUrl))).toMatchObject({
			ok: true,
			media: {
				kind: 'photo',
				contactId: 'c-bert',
				personId: BERT_ID,
				size: 'preview',
				together: { contactId: 'c-cleo', personId: CARL_ID }
			}
		});
		expect(gateway.calls).toEqual(['latestAssets']);

		if (glimpse.nextCursor === null) throw new Error('no second page');
		const more = await readImmichGlimpse(
			glimpseDeps,
			viewer,
			'c-bert',
			glimpse.nextCursor,
			'c-cleo'
		);
		expect(more).toMatchObject({ state: 'photos', nextCursor: null });
	});

	it('gives nothing when the other person is out of reach, not linked, or the same person, without asking Immich', async () => {
		const { glimpseDeps, gateway } = setup();
		for (const other of ['c-dora', 'c-carl', 'c-bert', 'c-nobody']) {
			expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null, other)).toBeNull();
		}
		// And the page's own person must be linked and seen too, whoever the other is.
		expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-carl', null, 'c-bert')).toBeNull();
		expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-dora', null, 'c-bert')).toBeNull();
		expect(gateway.calls).toEqual([]);
	});

	it('says when either of them is gone from Immich', async () => {
		const { glimpseDeps, gateway } = setup();
		gateway.library.people = gateway.library.people.filter((person) => person.id !== CARL_ID);
		expect(await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null, 'c-cleo')).toEqual({
			state: 'personGone'
		});
	});
});

describe('readTogetherOffers', () => {
	it('keeps the people the viewer sees who are linked too, in the order asked', async () => {
		const { glimpseDeps } = setup();
		expect(
			await readTogetherOffers(glimpseDeps, viewer, 'c-bert', [
				'c-cleo',
				'c-carl',
				'c-dora',
				'c-nobody'
			])
		).toEqual(['c-cleo']);
	});

	it('offers nobody when the page’s own person is not linked or out of reach', async () => {
		const { glimpseDeps } = setup();
		expect(await readTogetherOffers(glimpseDeps, viewer, 'c-carl', ['c-cleo', 'c-bert'])).toEqual(
			[]
		);
		expect(await readTogetherOffers(glimpseDeps, viewer, 'c-dora', ['c-cleo'])).toEqual([]);
	});

	it('asks Immich nothing: what may be shown is Stella’s to say', async () => {
		const { glimpseDeps, gateway } = setup();
		await readTogetherOffers(glimpseDeps, viewer, 'c-bert', ['c-cleo']);
		expect(gateway.calls).toEqual([]);
	});
});

describe('openImmichMedia', () => {
	async function photoToken(
		signer: ImmichMediaSigner,
		overrides: Partial<{ contactId: string; personId: string }> = {}
	) {
		return signer.sign({
			kind: 'photo',
			contactId: 'c-bert',
			personId: BERT_ID,
			assetId: fakeAssetId(BERT_ID, 0),
			size: 'preview',
			...overrides
		});
	}

	it('serves the photo a token names, at the size it names', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const outcome = await openImmichMedia(mediaDeps, viewer, await photoToken(signer));
		if (!outcome.ok) throw new Error(`refused: ${outcome.refusal}`);
		expect(outcome.image.contentType).toBe('image/png');
		expect(gateway.calls).toEqual(['assetImage']);
	});

	it('refuses an expired token, without asking Immich', async () => {
		const { mediaDeps, signer, gateway, clock } = setup();
		const token = await photoToken(signer);
		clock.advance(IMMICH_MEDIA_TTL_MS);
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'expired'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a tampered token, and a bare Immich id, without asking Immich', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const token = await photoToken(signer);
		const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
		for (const raw of [tampered, fakeAssetId(BERT_ID, 0), BERT_ID]) {
			expect(await openImmichMedia(mediaDeps, viewer, raw)).toEqual({
				ok: false,
				refusal: 'invalid'
			});
		}
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a token for a person the viewer cannot see, without asking Immich', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const token = await photoToken(signer, { contactId: 'c-dora', personId: DORA_ID });
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notVisible'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a token once the person was unlinked, or linked to another Immich person', async () => {
		const unlinked = setup();
		const token = await photoToken(unlinked.signer);
		unlinked.home.links.delete('c-bert');
		expect(await openImmichMedia(unlinked.mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notLinked'
		});

		const relinked = setup();
		const old = await photoToken(relinked.signer);
		relinked.home.links.set('c-bert', {
			contactId: 'c-bert',
			immichPersonId: CARL_ID,
			linkedBy: 'u-anna',
			linkedAt: NOW
		});
		expect(await openImmichMedia(relinked.mediaDeps, viewer, old)).toEqual({
			ok: false,
			refusal: 'notLinked'
		});

		expect([...unlinked.gateway.calls, ...relinked.gateway.calls]).toEqual([]);
	});

	async function togetherToken(signer: ImmichMediaSigner) {
		return signer.sign({
			kind: 'photo',
			contactId: 'c-bert',
			personId: BERT_ID,
			assetId: fakeAssetId(BERT_AND_CARL_ID, 0),
			size: 'thumbnail',
			together: { contactId: 'c-cleo', personId: CARL_ID }
		});
	}

	it('serves a photo of two people together while the viewer sees both and both links hold', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const outcome = await openImmichMedia(mediaDeps, viewer, await togetherToken(signer));
		expect(outcome.ok).toBe(true);
		expect(gateway.calls).toEqual(['assetImage']);
	});

	it('refuses a together photo once the other person is out of reach, without asking Immich', async () => {
		const { mediaDeps, signer, gateway, home } = setup();
		const token = await togetherToken(signer);
		home.visible.delete('c-cleo');
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notVisible'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a together photo once either person was unlinked or relinked, without asking Immich', async () => {
		const unlinked = setup();
		const token = await togetherToken(unlinked.signer);
		unlinked.home.links.delete('c-cleo');
		expect(await openImmichMedia(unlinked.mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notLinked'
		});

		const relinked = setup();
		const old = await togetherToken(relinked.signer);
		relinked.home.links.set('c-cleo', {
			contactId: 'c-cleo',
			immichPersonId: DORA_ID,
			linkedBy: 'u-anna',
			linkedAt: NOW
		});
		expect(await openImmichMedia(relinked.mediaDeps, viewer, old)).toEqual({
			ok: false,
			refusal: 'notLinked'
		});

		const pageUnlinked = setup();
		const third = await togetherToken(pageUnlinked.signer);
		pageUnlinked.home.links.delete('c-bert');
		expect(await openImmichMedia(pageUnlinked.mediaDeps, viewer, third)).toEqual({
			ok: false,
			refusal: 'notLinked'
		});

		expect([
			...unlinked.gateway.calls,
			...relinked.gateway.calls,
			...pageUnlinked.gateway.calls
		]).toEqual([]);
	});

	it('passes on that Immich did not answer, or no longer has the photo', async () => {
		const down = setup();
		down.gateway.failing = { assetImage: 'unreachable' };
		expect(await openImmichMedia(down.mediaDeps, viewer, await photoToken(down.signer))).toEqual({
			ok: false,
			refusal: 'unreachable'
		});

		const gone = setup();
		const token = await gone.signer.sign({
			kind: 'photo',
			contactId: 'c-bert',
			personId: BERT_ID,
			assetId: fakeAssetId(BERT_ID, 999_999),
			size: 'thumbnail'
		});
		expect(await openImmichMedia(gone.mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notFound'
		});
	});

	it('serves a face the picker was given for a person the viewer can see, linked or not', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const outcome = await openImmichMedia(
			mediaDeps,
			viewer,
			tokenOf(await faceUrlFor(signer, 'c-carl', BERT_ID))
		);
		expect(outcome.ok).toBe(true);
		expect(gateway.calls).toEqual(['personThumbnail']);
	});

	it('refuses a face for a person the viewer cannot see, without asking Immich', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const token = tokenOf(await faceUrlFor(signer, 'c-dora', BERT_ID));
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notVisible'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('serves the face of someone not in Stella yet to a member of the household it was signed for', async () => {
		const { mediaDeps, signer, gateway, home } = setup();
		home.links.delete('c-cleo');
		const outcome = await openImmichMedia(
			mediaDeps,
			viewer,
			tokenOf(await newcomerFaceUrl(signer, 'h1', CARL_ID))
		);
		expect(outcome.ok).toBe(true);
		expect(gateway.calls).toEqual(['personThumbnail']);
	});

	it('refuses a newcomer face to another household, without asking Immich', async () => {
		const { mediaDeps, signer, gateway, home } = setup();
		home.links.delete('c-cleo');
		const token = tokenOf(await newcomerFaceUrl(signer, 'h2', CARL_ID));
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notVisible'
		});
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a newcomer face once someone holds it, even someone the viewer cannot see', async () => {
		const { mediaDeps, signer, gateway } = setup();
		// Dora holds DORA_ID and is out of the viewer's reach: the face is hers to show, not a newcomer's.
		const token = tokenOf(await newcomerFaceUrl(signer, 'h1', DORA_ID));
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({
			ok: false,
			refusal: 'notVisible'
		});
		expect(gateway.calls).toEqual([]);
	});
});
