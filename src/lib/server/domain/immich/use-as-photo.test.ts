import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import type { AvatarUpload, AvatarUploader } from '../media/avatars';
import { fakeAssetId } from '../../immich/fake-gateway';
import type { ImmichLink } from './links';
import { createImmichMediaSigner, IMMICH_MEDIA_TTL_MS, type SignableImmichMedia } from './signed-media';
import { BERT_ID, CARL_ID } from './test-library';
import { useImmichPhoto, type UseImmichPhotoDeps } from './use-as-photo';

/*
 * *Use as photo* from the Immich viewer (docs/concepts/immich.md §4.3, docs/02 §2.24): the one way
 * Immich content enters Stella. The square comes from the browser, cut from the preview the proxy
 * served; the server takes it only for a preview token it signed for this person, while the
 * viewer still sees them and they are still linked to the Immich person the photo was listed for.
 * Every refusal is checked against an avatar port that records its calls, so "refused" also means
 * "nothing was stored".
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const NOW = 1_700_000_000_000;
const TAKEN_AT = '2019-05-03T14:22:01';

const square: Omit<AvatarUpload, 'takenAt'> = {
	image: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]),
	thumb: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 2]),
	width: 512,
	height: 512
};

function setup() {
	let now = NOW;
	const clock: Clock = { now: () => now };
	const signer = createImmichMediaSigner({ secret: 'test-secret', clock });
	// Bert is visible and linked; Dora is linked but out of the viewer's reach.
	const visible = new Set(['c-bert']);
	const links = new Map<string, ImmichLink>([
		['c-bert', { contactId: 'c-bert', immichPersonId: BERT_ID, linkedBy: 'u-anna', linkedAt: NOW }],
		['c-dora', { contactId: 'c-dora', immichPersonId: CARL_ID, linkedBy: 'u-bert', linkedAt: NOW }]
	]);
	const worn: { uploader: AvatarUploader; contactId: string; upload: AvatarUpload }[] = [];
	const deps: UseImmichPhotoDeps = {
		signer,
		links: {
			findForContactVisibleTo: async (_viewer, contactId) =>
				visible.has(contactId) ? (links.get(contactId) ?? null) : null
		},
		contacts: {
			findByIdVisibleTo: async (_viewer, id) => (visible.has(id) ? { displayName: id, visibility: 'shared' } : null)
		},
		setAvatar: async (uploader, contactId, upload) => {
			worn.push({ uploader, contactId, upload });
			return 'photo-1';
		}
	};
	const preview = (over: Partial<SignableImmichMedia & { kind: 'photo' }> = {}) =>
		signer.sign({
			kind: 'photo',
			contactId: 'c-bert',
			personId: BERT_ID,
			assetId: fakeAssetId(BERT_ID, 0),
			size: 'preview',
			takenAt: TAKEN_AT,
			...over
		});
	return { deps, worn, links, preview, advance: (ms: number) => void (now += ms) };
}

describe('useImmichPhoto', () => {
	it('stores the square as the person’s new photo, dated by when Immich says it was taken', async () => {
		const { deps, worn, preview } = setup();
		const outcome = await useImmichPhoto(deps, viewer, { contactId: 'c-bert', token: await preview(), upload: square });

		expect(outcome).toEqual({ ok: true, photoId: 'photo-1' });
		expect(worn).toEqual([
			{
				uploader: { userId: 'u-anna', householdId: 'h1' },
				contactId: 'c-bert',
				upload: { ...square, takenAt: TAKEN_AT }
			}
		]);
	});

	it('stores it undated when Immich did not say when it was taken', async () => {
		const { deps, worn, preview } = setup();
		const token = await preview({ takenAt: undefined });
		expect(await useImmichPhoto(deps, viewer, { contactId: 'c-bert', token, upload: square })).toMatchObject({ ok: true });
		expect(worn[0]?.upload.takenAt).toBeNull();
	});

	it('refuses anything but a preview token Stella signed for this very person', async () => {
		const { deps, worn, preview } = setup();
		const thumbnail = await preview({ size: 'thumbnail' });
		const face = await deps.signer.sign({ kind: 'face', contactId: 'c-bert', personId: BERT_ID });
		const forBertOnCarlsPage = await preview();
		for (const [contactId, token] of [
			['c-bert', thumbnail],
			['c-bert', face],
			['c-carl', forBertOnCarlsPage],
			['c-bert', fakeAssetId(BERT_ID, 0)],
			['c-bert', 'x.y']
		] as const) {
			expect(await useImmichPhoto(deps, viewer, { contactId, token, upload: square })).toEqual({
				ok: false,
				refusal: 'invalid'
			});
		}
		expect(worn).toEqual([]);
	});

	it('refuses an expired token', async () => {
		const { deps, worn, preview, advance } = setup();
		const token = await preview();
		advance(IMMICH_MEDIA_TTL_MS);
		expect(await useImmichPhoto(deps, viewer, { contactId: 'c-bert', token, upload: square })).toEqual({
			ok: false,
			refusal: 'expired'
		});
		expect(worn).toEqual([]);
	});

	it('refuses a person the viewer cannot see, whatever the token says', async () => {
		const { deps, worn, preview } = setup();
		const token = await preview({ contactId: 'c-dora', personId: CARL_ID });
		expect(await useImmichPhoto(deps, viewer, { contactId: 'c-dora', token, upload: square })).toEqual({
			ok: false,
			refusal: 'notVisible'
		});
		expect(worn).toEqual([]);
	});

	it('refuses once the person was unlinked, or linked to another Immich person', async () => {
		const unlinked = setup();
		const token = await unlinked.preview();
		unlinked.links.delete('c-bert');
		expect(await useImmichPhoto(unlinked.deps, viewer, { contactId: 'c-bert', token, upload: square })).toEqual({
			ok: false,
			refusal: 'notLinked'
		});

		const relinked = setup();
		const old = await relinked.preview();
		relinked.links.set('c-bert', { contactId: 'c-bert', immichPersonId: CARL_ID, linkedBy: 'u-anna', linkedAt: NOW });
		expect(await useImmichPhoto(relinked.deps, viewer, { contactId: 'c-bert', token: old, upload: square })).toEqual({
			ok: false,
			refusal: 'notLinked'
		});
		expect([...unlinked.worn, ...relinked.worn]).toEqual([]);
	});
});
