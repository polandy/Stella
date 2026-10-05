import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { createFakeImmichGateway, fakeAssetId } from '../../immich/fake-gateway';
import {
	faceUrlFor,
	GLIMPSE_PAGE_SIZE,
	openImmichMedia,
	readImmichGlimpse,
	type ImmichGlimpseDeps,
	type ImmichMediaDeps
} from './glimpse';
import type { ImmichLink } from './links';
import { createImmichMediaSigner, IMMICH_MEDIA_TTL_MS, type ImmichMediaSigner } from './signed-media';
import { BERT_ID, CARL_ID, testLibrary } from './test-library';

/*
 * The glimpse of a linked person's photos (docs/concepts/immich.md §4.3, §5): the strip's signed
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
 * visible and not linked, Dora is linked but private to someone else — out of the viewer's reach.
 */
function household() {
	const visible = new Set(['c-bert', 'c-carl']);
	const links = new Map<string, ImmichLink>([
		['c-bert', { contactId: 'c-bert', immichPersonId: BERT_ID, linkedBy: 'u-anna', linkedAt: NOW }],
		['c-dora', { contactId: 'c-dora', immichPersonId: CARL_ID, linkedBy: 'u-bert', linkedAt: NOW }]
	]);
	return {
		visible,
		links,
		repository: {
			findForContactVisibleTo: async (_viewer: Viewer, contactId: string) =>
				visible.has(contactId) ? (links.get(contactId) ?? null) : null
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
	const glimpseDeps: ImmichGlimpseDeps = { links: home.repository, gateway, signer, publicUrl: PUBLIC_URL };
	const mediaDeps: ImmichMediaDeps = { links: home.repository, contacts: home.contacts, gateway, signer };
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
		expect(await signer.verify(tokenOf(first.previewUrl))).toMatchObject({ ok: true, media: { size: 'preview' } });
		expect(first.openUrl).toBe(`${PUBLIC_URL}/photos/${first.id}`);
		expect(first.takenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('signs when a photo was taken into its preview, the picture *Use as photo* starts from', async () => {
		const { glimpseDeps, signer, gateway } = setup();
		const glimpse = await readImmichGlimpse(glimpseDeps, viewer, 'c-bert', null);
		if (glimpse?.state !== 'photos') throw new Error(`no photos: ${JSON.stringify(glimpse)}`);
		const [first] = glimpse.photos;
		const listed = await gateway.latestAssets(BERT_ID, 1, null);
		if (!listed.ok) throw new Error('the fake did not list');
		const takenAt = listed.value.assets[0].takenAt;
		expect(takenAt).not.toBeNull();

		expect(await signer.verify(tokenOf(first.previewUrl))).toMatchObject({ ok: true, media: { takenAt } });
		expect(first.takenOn).toBe(takenAt!.slice(0, 10));
		const thumbnail = await signer.verify(tokenOf(first.thumbnailUrl));
		expect(thumbnail.ok && 'takenAt' in thumbnail.media).toBe(false);
	});

	it('goes on from where the last page ended, and says when there is no more', async () => {
		const { glimpseDeps } = setup();
		// Carl has seven photos: one short page, and nothing after it.
		glimpseDeps.links = {
			findForContactVisibleTo: async () => ({ contactId: 'c-bert', immichPersonId: CARL_ID, linkedBy: 'u', linkedAt: NOW })
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
		gone.gateway.library.people = gone.gateway.library.people.filter((person) => person.id !== BERT_ID);
		expect(await readImmichGlimpse(gone.glimpseDeps, viewer, 'c-bert', null)).toEqual({ state: 'personGone' });

		const down = setup();
		down.gateway.failing = { latestAssets: 'unreachable' };
		expect(await readImmichGlimpse(down.glimpseDeps, viewer, 'c-bert', null)).toEqual({ state: 'unreachable' });

		const unscoped = setup();
		unscoped.gateway.failing = { latestAssets: 'forbidden' };
		expect(await readImmichGlimpse(unscoped.glimpseDeps, viewer, 'c-bert', null)).toEqual({ state: 'unreachable' });
	});
});

describe('openImmichMedia', () => {
	async function photoToken(signer: ImmichMediaSigner, overrides: Partial<{ contactId: string; personId: string }> = {}) {
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
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({ ok: false, refusal: 'expired' });
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a tampered token, and a bare Immich id, without asking Immich', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const token = await photoToken(signer);
		const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
		for (const raw of [tampered, fakeAssetId(BERT_ID, 0), BERT_ID]) {
			expect(await openImmichMedia(mediaDeps, viewer, raw)).toEqual({ ok: false, refusal: 'invalid' });
		}
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a token for a person the viewer cannot see, without asking Immich', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const token = await photoToken(signer, { contactId: 'c-dora', personId: CARL_ID });
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({ ok: false, refusal: 'notVisible' });
		expect(gateway.calls).toEqual([]);
	});

	it('refuses a token once the person was unlinked, or linked to another Immich person', async () => {
		const unlinked = setup();
		const token = await photoToken(unlinked.signer);
		unlinked.home.links.delete('c-bert');
		expect(await openImmichMedia(unlinked.mediaDeps, viewer, token)).toEqual({ ok: false, refusal: 'notLinked' });

		const relinked = setup();
		const old = await photoToken(relinked.signer);
		relinked.home.links.set('c-bert', { contactId: 'c-bert', immichPersonId: CARL_ID, linkedBy: 'u-anna', linkedAt: NOW });
		expect(await openImmichMedia(relinked.mediaDeps, viewer, old)).toEqual({ ok: false, refusal: 'notLinked' });

		expect([...unlinked.gateway.calls, ...relinked.gateway.calls]).toEqual([]);
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
		expect(await openImmichMedia(gone.mediaDeps, viewer, token)).toEqual({ ok: false, refusal: 'notFound' });
	});

	it('serves a face the picker was given for a person the viewer can see, linked or not', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const outcome = await openImmichMedia(mediaDeps, viewer, tokenOf(await faceUrlFor(signer, 'c-carl', BERT_ID)));
		expect(outcome.ok).toBe(true);
		expect(gateway.calls).toEqual(['personThumbnail']);
	});

	it('refuses a face for a person the viewer cannot see, without asking Immich', async () => {
		const { mediaDeps, signer, gateway } = setup();
		const token = tokenOf(await faceUrlFor(signer, 'c-dora', BERT_ID));
		expect(await openImmichMedia(mediaDeps, viewer, token)).toEqual({ ok: false, refusal: 'notVisible' });
		expect(gateway.calls).toEqual([]);
	});
});
