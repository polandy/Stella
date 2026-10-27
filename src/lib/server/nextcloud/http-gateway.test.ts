import { describe, expect, it } from 'bun:test';
import { AddressBookUnreachableError } from '../domain/nextcloud/address-book';
import { createHttpAddressBookGateway } from './http-gateway';

const BOOK = 'https://cloud.example.com/remote.php/dav/addressbooks/users/family/contacts/';
const PATH = '/remote.php/dav/addressbooks/users/family/contacts/';

interface Seen {
	method: string;
	url: string;
	headers: Headers;
	body: string;
}

/** A fetch that answers each request with the next canned response, recording what it saw. */
function fakeFetch(answers: (Response | ((seen: Seen) => Response))[]) {
	const seen: Seen[] = [];
	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const request = {
			method: init?.method ?? 'GET',
			url: String(input),
			headers: new Headers(init?.headers),
			body: typeof init?.body === 'string' ? init.body : ''
		};
		seen.push(request);
		const next = answers.shift();
		if (!next) throw new Error(`unexpected request ${request.method} ${request.url}`);
		return typeof next === 'function' ? next(request) : next;
	}) as typeof globalThis.fetch;
	return { fetch, seen };
}

const multistatus = (body: string) =>
	new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">${body}</d:multistatus>`, {
		status: 207,
		headers: { 'content-type': 'application/xml; charset=utf-8' }
	});

const changedEntry = (name: string, etag: string) =>
	`<d:response><d:href>${PATH}${name}</d:href><d:propstat><d:prop><d:getetag>&quot;${etag}&quot;</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;

const card = (name: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\nUID:${name}\r\nFN:${name} &amp; Co\r\nN:;${name};;;\r\nEND:VCARD\r\n`;

const gateway = (fetch: typeof globalThis.fetch) =>
	createHttpAddressBookGateway({
		url: BOOK,
		user: 'family',
		appPassword: 's3cret',
		fetch,
		log: () => {}
	});

describe('the CardDAV address book', () => {
	it('reads the whole book first, then fetches the changed cards in one multiget', async () => {
		const { fetch, seen } = fakeFetch([
			multistatus(
				`<d:response><d:href>${PATH}</d:href><d:propstat><d:prop><d:getetag/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>` +
					changedEntry('a.vcf', 'e1') +
					changedEntry('b.vcf', 'e2') +
					'<d:sync-token>http://sabre.io/ns/sync/7</d:sync-token>'
			),
			multistatus(
				`<d:response><d:href>${PATH}a.vcf</d:href><d:propstat><d:prop><d:getetag>"e1"</d:getetag><card:address-data>${card('a')}</card:address-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>` +
					`<d:response><d:href>${PATH}b.vcf</d:href><d:propstat><d:prop><d:getetag>"e2"</d:getetag><card:address-data><![CDATA[${card('b').replace('&amp;', '&')}]]></card:address-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
			)
		]);
		const changes = await gateway(fetch).changesSince(null);

		expect(changes).toEqual({
			token: 'http://sabre.io/ns/sync/7',
			complete: true,
			deleted: [],
			changed: [
				{ href: `${PATH}a.vcf`, etag: '"e1"', vcard: card('a').replace('&amp;', '&') },
				{ href: `${PATH}b.vcf`, etag: '"e2"', vcard: card('b').replace('&amp;', '&') }
			]
		});
		expect(seen[0]!.method).toBe('REPORT');
		expect(seen[0]!.url).toBe(BOOK);
		expect(seen[0]!.headers.get('depth')).toBe('0');
		expect(seen[0]!.headers.get('authorization')).toBe(`Basic ${btoa('family:s3cret')}`);
		expect(seen[0]!.body).toContain('<d:sync-token></d:sync-token>');
		expect(seen[1]!.body).toContain(`<d:href>${PATH}a.vcf</d:href>`);
	});

	it('asks from the token it was given and tells deleted cards apart', async () => {
		const { fetch, seen } = fakeFetch([
			multistatus(
				changedEntry('a.vcf', 'e3') +
					`<d:response><d:href>${PATH}gone.vcf</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>` +
					'<d:sync-token>http://sabre.io/ns/sync/8</d:sync-token>'
			),
			multistatus(
				`<d:response><d:href>${PATH}a.vcf</d:href><d:propstat><d:prop><d:getetag>"e3"</d:getetag><card:address-data>${card('a')}</card:address-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
			)
		]);
		const changes = await gateway(fetch).changesSince('http://sabre.io/ns/sync/7');

		expect(changes.complete).toBe(false);
		expect(changes.deleted).toEqual([`${PATH}gone.vcf`]);
		expect(changes.changed.map((c) => c.etag)).toEqual(['"e3"']);
		expect(seen[0]!.body).toContain('<d:sync-token>http://sabre.io/ns/sync/7</d:sync-token>');
	});

	it('starts over with the whole book when the server forgot the token', async () => {
		const { fetch, seen } = fakeFetch([
			new Response('<d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>', { status: 403 }),
			multistatus('<d:sync-token>http://sabre.io/ns/sync/9</d:sync-token>')
		]);
		const changes = await gateway(fetch).changesSince('http://sabre.io/ns/sync/1');

		expect(changes).toEqual({
			token: 'http://sabre.io/ns/sync/9',
			changed: [],
			deleted: [],
			complete: true
		});
		expect(seen[1]!.body).toContain('<d:sync-token></d:sync-token>');
	});

	it('fails loud, without the password, when the book cannot be read', async () => {
		const { fetch } = fakeFetch([new Response('nope', { status: 401 })]);
		const read = gateway(fetch).changesSince(null);
		const error = await read.catch((err: unknown) => err);
		expect(error).toBeInstanceOf(AddressBookUnreachableError);
		expect(String(error)).not.toContain('s3cret');
	});

	it('writes a card only if it is still the one read', async () => {
		const { fetch, seen } = fakeFetch([
			new Response(null, { status: 204, headers: { etag: '"e9"' } }),
			new Response(null, { status: 412 }),
			new Response(null, { status: 404 })
		]);
		const book = gateway(fetch);

		expect(await book.put(`${PATH}a.vcf`, card('a'), '"e1"')).toEqual({ etag: '"e9"' });
		expect(await book.put(`${PATH}a.vcf`, card('a'), '"e1"')).toBe('stale');
		expect(await book.put(`${PATH}a.vcf`, card('a'), '"e1"')).toBe('gone');
		expect(seen[0]!.method).toBe('PUT');
		expect(seen[0]!.url).toBe(`https://cloud.example.com${PATH}a.vcf`);
		expect(seen[0]!.headers.get('if-match')).toBe('"e1"');
		expect(seen[0]!.headers.get('content-type')).toBe('text/vcard; charset=utf-8');
	});
});
