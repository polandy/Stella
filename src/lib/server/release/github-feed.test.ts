import { describe, expect, it } from 'bun:test';
import { createGitHubReleaseFeed, STELLA_RELEASE_FEED } from './github-feed';

/** A `fetch` that answers with what the test planted and records how it was called. */
function stubFetch(response: Response) {
	const calls: Array<{ url: string; headers: Headers }> = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(input), headers: new Headers(init?.headers) });
		return response;
	}) as typeof globalThis.fetch;
	return { fetch, calls };
}

const body = (payload: unknown, init?: ResponseInit) =>
	new Response(JSON.stringify(payload), init);

describe('createGitHubReleaseFeed', () => {
	it('reads the newest release off GitHub, naming itself in the request', async () => {
		const { fetch, calls } = stubFetch(
			body({
				tag_name: 'v0.0.11',
				html_url: 'https://github.com/polandy/Stella/releases/tag/v0.0.11'
			})
		);

		const latest = await createGitHubReleaseFeed({ version: '0.0.10', fetch }).latest();

		expect(latest).toEqual({
			tag: 'v0.0.11',
			url: 'https://github.com/polandy/Stella/releases/tag/v0.0.11'
		});
		expect(calls[0].url).toBe(STELLA_RELEASE_FEED);
		expect(calls[0].headers.get('user-agent')).toBe('Stella/0.0.10');
		expect(calls[0].headers.get('accept')).toBe('application/vnd.github+json');
	});

	it('treats a repository without a release as an answer, not a failure', async () => {
		const { fetch } = stubFetch(body({ message: 'Not Found' }, { status: 404 }));

		expect(await createGitHubReleaseFeed({ version: '0.0.10', fetch }).latest()).toBeNull();
	});

	it('refuses an answer GitHub could not give', async () => {
		const { fetch } = stubFetch(body({ message: 'rate limited' }, { status: 403 }));

		expect(createGitHubReleaseFeed({ version: '0.0.10', fetch }).latest()).rejects.toThrow('403');
	});

	it('refuses a body far larger than a release document', async () => {
		const { fetch } = stubFetch(new Response('x'.repeat(65 * 1024)));

		expect(createGitHubReleaseFeed({ version: '0.0.10', fetch }).latest()).rejects.toThrow(
			'more than'
		);
	});
});
