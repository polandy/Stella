import { readLatestRelease, type LatestRelease, type ReleaseFeed } from '../domain/release/feed';

/*
 * The release feed adapter (docs/04 §4.9): GitHub's `releases/latest` endpoint, unauthenticated.
 * The only file that knows Stella's releases live on GitHub — the use-case sees a port.
 *
 * Deliberately not given the browser request's abort signal: the answer is cached for a day
 * for everyone, so a visitor closing the tab must not cancel the check and leave the next
 * visitor with "unreachable" until tomorrow.
 */

/** Where Stella's own releases are published. */
export const STELLA_RELEASE_FEED = 'https://api.github.com/repos/polandy/Stella/releases/latest';

/** How long the instance waits for GitHub before giving up on this round. */
const TIMEOUT_MS = 5_000;

/** Most bytes read from the answer — GitHub's is a few kB; anything larger is not one. */
const MAX_BYTES = 64 * 1024;

export interface GitHubReleaseFeedOptions {
	/** The instance's version, so the request identifies itself as GitHub asks callers to. */
	version: string;
	/** Overridable for tests; defaults to Stella's own feed. */
	url?: string;
	/** Overridable for tests; defaults to the platform's `fetch`. */
	fetch?: typeof globalThis.fetch;
}

/** Reads a body up to `MAX_BYTES`, refusing anything longer instead of buffering it. */
async function readCapped(response: Response): Promise<string> {
	const body = response.body;
	if (!body) return '';

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BYTES) throw new Error(`release feed answered with more than ${MAX_BYTES} bytes`);
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}

	const joined = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		joined.set(chunk, at);
		at += chunk.byteLength;
	}
	return new TextDecoder().decode(joined);
}

/** The newest published release of Stella, read from GitHub. */
export function createGitHubReleaseFeed({
	version,
	url = STELLA_RELEASE_FEED,
	fetch = globalThis.fetch
}: GitHubReleaseFeedOptions): ReleaseFeed {
	return {
		async latest(): Promise<LatestRelease | null> {
			const response = await fetch(url, {
				headers: {
					accept: 'application/vnd.github+json',
					'user-agent': `Stella/${version}`
				},
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});

			// A repository that has never published one is an answer, not a failure.
			if (response.status === 404) return null;
			if (!response.ok) throw new Error(`release feed answered ${response.status}`);

			return readLatestRelease(JSON.parse(await readCapped(response)));
		}
	};
}
