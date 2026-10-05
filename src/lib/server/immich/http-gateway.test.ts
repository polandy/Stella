import { describe, expect, it } from 'bun:test';
import { createHttpImmichGateway } from './http-gateway';

const BASE = 'http://immich-server:2283';
const KEY = 'test-key-not-a-real-one';
const ID = '0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70';
const ASSET = '00000000-4d5e-4f60-8a1b-2c3d4e5f6a70';

/** A `fetch` that answers with what the test planted, recording each request. */
function stub(answer: () => Response | Promise<Response>) {
	const calls: {
		url: string;
		method: string;
		body: unknown;
		headers: Headers;
		signal: AbortSignal | null | undefined;
		redirect?: RequestRedirect;
	}[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? 'GET',
			body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
			headers: new Headers(init?.headers),
			signal: init?.signal,
			redirect: init?.redirect
		});
		return answer();
	}) as typeof globalThis.fetch;
	const logged: string[] = [];
	const gateway = createHttpImmichGateway({
		baseUrl: BASE,
		apiKey: KEY,
		fetch,
		log: (message) => logged.push(message)
	});
	return { gateway, calls, logged };
}

const json = (payload: unknown, status = 200) =>
	new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

describe('createHttpImmichGateway', () => {
	it('asks with the key in its header, and a deadline', async () => {
		const { gateway, calls } = stub(() => json({ major: 3, minor: 2, patch: 4 }));
		expect(await gateway.version()).toEqual({ ok: true, value: { major: 3, minor: 2, patch: 4 } });
		expect(calls[0].url).toBe(`${BASE}/api/server/version`);
		expect(calls[0].headers.get('x-api-key')).toBe(KEY);
		expect(calls[0].signal).toBeInstanceOf(AbortSignal);
	});

	it('reads the owner, the people and the count from their endpoints', async () => {
		const { gateway, calls } = stub(() => json({ email: 'anna@example.test', name: 'Anna' }));
		expect(await gateway.owner()).toEqual({ ok: true, value: { name: 'Anna', email: 'anna@example.test' } });

		const people = stub(() => json({ people: [{ id: ID, name: 'Bert' }], hasNextPage: false }));
		expect(await people.gateway.listPeople(2, 50)).toEqual({
			ok: true,
			value: { people: [{ id: ID, name: 'Bert', hidden: false }], hasNextPage: false }
		});
		expect(people.calls[0].url).toBe(`${BASE}/api/people?page=2&size=50&withHidden=false`);

		const stats = stub(() => json({ assets: 12 }));
		expect(await stats.gateway.personStatistics(ID)).toEqual({ ok: true, value: { assets: 12 } });
		expect(stats.calls[0].url).toBe(`${BASE}/api/people/${ID}/statistics`);
		expect(calls[0].url).toBe(`${BASE}/api/users/me`);
	});

	it('searches by name, escaped, without hidden people', async () => {
		const { gateway, calls } = stub(() => json([{ id: ID, name: 'Bert & Co' }]));
		expect(await gateway.searchPeople('Bert & Co')).toEqual({
			ok: true,
			value: [{ id: ID, name: 'Bert & Co', hidden: false }]
		});
		expect(calls[0].url).toBe(`${BASE}/api/search/person?name=Bert+%26+Co&withHidden=false`);
	});

	it('maps a refused, an under-scoped and a missing answer to outcomes, not throws', async () => {
		expect(await stub(() => json({}, 401)).gateway.owner()).toEqual({ ok: false, failure: 'unauthorized' });
		expect(await stub(() => json({}, 403)).gateway.listPeople(1, 1)).toEqual({ ok: false, failure: 'forbidden' });
		expect(await stub(() => json({}, 404)).gateway.person(ID)).toEqual({ ok: false, failure: 'notFound' });
	});

	it('reads Immich’s 400 for a person it no longer has as not found', async () => {
		// Immich's access check answers a deleted person's id with 400, not 404.
		expect(await stub(() => json({ message: 'Not found or no person.read access' }, 400)).gateway.person(ID)).toEqual({
			ok: false,
			failure: 'notFound'
		});
	});

	it('calls an Immich that fails, times out or cannot be reached unreachable — and logs it without the key', async () => {
		const down = stub(() => json({}, 502));
		expect(await down.gateway.version()).toEqual({ ok: false, failure: 'unreachable' });

		const gone = stub(() => Promise.reject(new TypeError('fetch failed')));
		expect(await gone.gateway.owner()).toEqual({ ok: false, failure: 'unreachable' });

		const slow = stub(() => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')));
		expect(await slow.gateway.person(ID)).toEqual({ ok: false, failure: 'unreachable' });

		for (const { logged } of [down, gone, slow]) {
			expect(logged).toHaveLength(1);
			expect(logged[0]).not.toContain(KEY);
		}
	});

	it('does not follow a gateway’s redirect to its login page, and says why in the log', async () => {
		const { gateway, logged, calls } = stub(
			() => new Response(null, { status: 302, headers: { location: 'https://auth.example.com/login' } })
		);
		expect(await gateway.owner()).toEqual({ ok: false, failure: 'unreachable' });
		expect(logged[0]).toContain('forward-auth');
		expect(calls[0].redirect).toBe('manual');
	});

	it('refuses an answer it cannot read, and one far larger than any it expects', async () => {
		const garbled = stub(() => new Response('<html>login</html>', { status: 200 }));
		expect(await garbled.gateway.owner()).toEqual({ ok: false, failure: 'unreachable' });

		const wrongShape = stub(() => json({ assets: 'many' }));
		expect(await wrongShape.gateway.personStatistics(ID)).toEqual({ ok: false, failure: 'unreachable' });

		const huge = stub(() => new Response('x'.repeat(3 * 1024 * 1024)));
		expect(await huge.gateway.searchPeople('a')).toEqual({ ok: false, failure: 'unreachable' });
	});

	it('never asks Immich about something that is not an Immich id', async () => {
		const { gateway, calls } = stub(() => json({ assets: 1 }));
		expect(await gateway.personStatistics('../users/me')).toEqual({ ok: false, failure: 'notFound' });
		expect(await gateway.personThumbnail('../users/me')).toEqual({ ok: false, failure: 'notFound' });
		expect(calls).toHaveLength(0);
	});

	it('passes a face thumbnail on with its image type', async () => {
		const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
		const { gateway, calls } = stub(() => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } }));
		expect(await gateway.personThumbnail(ID)).toEqual({ ok: true, value: { bytes, contentType: 'image/jpeg' } });
		expect(calls[0].url).toBe(`${BASE}/api/people/${ID}/thumbnail`);
	});

	it('refuses a thumbnail that is not an image', async () => {
		for (const type of ['text/html', 'image/svg+xml', '']) {
			const { gateway } = stub(() => new Response('<svg onload="x()"/>', { headers: { 'content-type': type } }));
			expect(await gateway.personThumbnail(ID)).toEqual({ ok: false, failure: 'unreachable' });
		}
	});

	it('asks for a person’s latest photos in the timeline, newest first, a page at a time', async () => {
		const { gateway, calls } = stub(() =>
			json({
				assets: {
					items: [{ id: ASSET, type: 'IMAGE', visibility: 'timeline', localDateTime: '2026-08-14T18:30:00.000Z' }],
					nextCursor: 'c2'
				}
			})
		);
		expect(await gateway.latestAssets(ID, 12, 'c1')).toEqual({
			ok: true,
			value: { assets: [{ id: ASSET, takenAt: '2026-08-14T18:30:00' }], nextCursor: 'c2' }
		});
		expect(calls[0].url).toBe(`${BASE}/api/search/metadata`);
		expect(calls[0].method).toBe('POST');
		expect(calls[0].headers.get('content-type')).toBe('application/json');
		expect(calls[0].headers.get('x-api-key')).toBe(KEY);
		expect(calls[0].body).toEqual({
			filter: {
				personIds: { any: [ID] },
				type: { eq: 'IMAGE' },
				visibility: { eq: 'timeline' }
			},
			orderBy: { field: 'fileCreatedAt', direction: 'desc' },
			size: 12,
			cursor: 'c1'
		});
	});

	it('asks for the first page without a cursor', async () => {
		const { gateway, calls } = stub(() => json({ assets: { items: [], nextCursor: null } }));
		expect(await gateway.latestAssets(ID, 12, null)).toEqual({ ok: true, value: { assets: [], nextCursor: null } });
		expect(calls[0].body).not.toHaveProperty('cursor');
	});

	it('reads a person Immich no longer has as not found, and a key without asset.read as forbidden', async () => {
		expect(await stub(() => json({}, 400)).gateway.latestAssets(ID, 12, null)).toEqual({
			ok: false,
			failure: 'notFound'
		});
		expect(await stub(() => json({}, 403)).gateway.latestAssets(ID, 12, null)).toEqual({
			ok: false,
			failure: 'forbidden'
		});
	});

	it('passes a photo on at the size asked for, with its image type', async () => {
		const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
		for (const size of ['thumbnail', 'preview'] as const) {
			const { gateway, calls } = stub(() => new Response(bytes, { headers: { 'content-type': 'image/webp' } }));
			expect(await gateway.assetImage(ASSET, size)).toEqual({ ok: true, value: { bytes, contentType: 'image/webp' } });
			expect(calls[0].url).toBe(`${BASE}/api/assets/${ASSET}/thumbnail?size=${size}`);
		}
	});

	it('refuses a photo that is not an image, and reads a deleted one as not found', async () => {
		const svg = stub(() => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }));
		expect(await svg.gateway.assetImage(ASSET, 'preview')).toEqual({ ok: false, failure: 'unreachable' });
		expect(await stub(() => json({}, 400)).gateway.assetImage(ASSET, 'preview')).toEqual({
			ok: false,
			failure: 'notFound'
		});
	});

	it('never asks Immich about a photo or a person whose id is not an Immich id', async () => {
		const { gateway, calls } = stub(() => json({}));
		expect(await gateway.assetImage('../users/me', 'preview')).toEqual({ ok: false, failure: 'notFound' });
		expect(await gateway.latestAssets('../users/me', 12, null)).toEqual({ ok: false, failure: 'notFound' });
		expect(calls).toHaveLength(0);
	});
});
