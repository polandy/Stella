import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import { createImmichMediaSigner, IMMICH_MEDIA_TTL_MS, type SignableImmichMedia } from './signed-media';
import { BERT_ID, CARL_ID } from './test-library';

/*
 * The signature on every Immich image URL Stella hands out (docs/concepts/immich.md §5). What it
 * must hold: a token names exactly what it was signed for, stops working at its expiry, and any
 * change to it — or a token signed with another secret — is refused rather than read.
 */

const SECRET = 'test-secret-not-a-real-one';
const ASSET_ID = '00000000-4d5e-4f60-8a1b-2c3d4e5f6a70';

function fakeClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void } {
	let now = start;
	return { now: () => now, advance: (ms) => void (now += ms) };
}

const photo: SignableImmichMedia = {
	kind: 'photo',
	contactId: 'c-bert',
	personId: BERT_ID,
	assetId: ASSET_ID,
	size: 'thumbnail'
};
const face: SignableImmichMedia = { kind: 'face', contactId: 'c-bert', personId: CARL_ID };

describe('createImmichMediaSigner', () => {
	it('reads back exactly what a photo token was signed for, with its expiry', async () => {
		const clock = fakeClock();
		const signer = createImmichMediaSigner({ secret: SECRET, clock });
		const token = await signer.sign(photo);
		expect(await signer.verify(token)).toEqual({
			ok: true,
			media: { ...photo, expiresAt: clock.now() + IMMICH_MEDIA_TTL_MS }
		});
	});

	it('reads back a face token', async () => {
		const clock = fakeClock();
		const signer = createImmichMediaSigner({ secret: SECRET, clock });
		expect(await signer.verify(await signer.sign(face))).toEqual({
			ok: true,
			media: { ...face, expiresAt: clock.now() + IMMICH_MEDIA_TTL_MS }
		});
	});

	it('keeps a token URL-safe, so it can travel as one path segment', async () => {
		const signer = createImmichMediaSigner({ secret: SECRET, clock: fakeClock() });
		expect(await signer.sign(photo)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	it('works until its expiry and not from that moment on', async () => {
		const clock = fakeClock();
		const signer = createImmichMediaSigner({ secret: SECRET, clock });
		const token = await signer.sign(photo);

		clock.advance(IMMICH_MEDIA_TTL_MS - 1);
		expect((await signer.verify(token)).ok).toBe(true);
		clock.advance(1);
		expect(await signer.verify(token)).toEqual({ ok: false, reason: 'expired' });
	});

	it('refuses a token whose content was changed, even into a well-formed one', async () => {
		const signer = createImmichMediaSigner({ secret: SECRET, clock: fakeClock() });
		const [, mac] = (await signer.sign(photo)).split('.');
		const other = (await signer.sign({ ...photo, size: 'preview' })).split('.')[0];
		expect(await signer.verify(`${other}.${mac}`)).toEqual({ ok: false, reason: 'invalid' });
	});

	it('refuses a token with a changed signature', async () => {
		const signer = createImmichMediaSigner({ secret: SECRET, clock: fakeClock() });
		const token = await signer.sign(photo);
		const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
		expect(await signer.verify(flipped)).toEqual({ ok: false, reason: 'invalid' });
	});

	it('refuses a token signed with another secret', async () => {
		const clock = fakeClock();
		const elsewhere = createImmichMediaSigner({ secret: 'another-secret', clock });
		const here = createImmichMediaSigner({ secret: SECRET, clock });
		expect(await here.verify(await elsewhere.sign(photo))).toEqual({ ok: false, reason: 'invalid' });
	});

	it('refuses a signature over the same payload made without this use of the secret', async () => {
		const signer = createImmichMediaSigner({ secret: SECRET, clock: fakeClock() });
		const [payload] = (await signer.sign(photo)).split('.');
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const bare = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
		const token = `${payload}.${Buffer.from(bare).toString('base64url')}`;
		expect(await signer.verify(token)).toEqual({ ok: false, reason: 'invalid' });
	});

	it('refuses anything that is not a token, without reading it', async () => {
		const signer = createImmichMediaSigner({ secret: SECRET, clock: fakeClock() });
		const token = await signer.sign(photo);
		for (const raw of ['', '.', 'abc', `${token}.x`, token.replace('.', ''), `${'a'.repeat(5000)}.b`, '../x.y']) {
			expect(await signer.verify(raw)).toEqual({ ok: false, reason: 'invalid' });
		}
	});
});
