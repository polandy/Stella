/*
 * What "the latest release" is, and how it is read out of an answer nobody here wrote
 * (docs/02 §2.17.1, docs/04 §4.9). The reading is pure so the untrusted-payload rules can
 * be tested without a network.
 */

/** The release a feed reports as the newest one. */
export interface LatestRelease {
	/** The release tag exactly as published, e.g. `v0.0.11`. */
	tag: string;
	/** Where a person can read about it, or null when the feed named no usable page. */
	url: string | null;
}

/** Where the latest release is asked for. Implemented at the edge; faked in tests. */
export interface ReleaseFeed {
	/** The newest release, or null when the feed has none. Throws when it cannot be reached. */
	latest(): Promise<LatestRelease | null>;
}

/**
 * A link only if it is an ordinary web page. The feed's answer travels into an `href`, and
 * a `javascript:` URL there is executable — so anything but `https:` is dropped and the
 * line renders without a link rather than with a dangerous one.
 */
export function webUrlOrNull(raw: unknown): string | null {
	if (typeof raw !== 'string' || raw === '') return null;
	try {
		// `new URL` refuses an https URL without a host outright, so the scheme is the whole test.
		return new URL(raw).protocol === 'https:' ? raw : null;
	} catch {
		return null;
	}
}

/** The release in a GitHub `releases/latest` body, or null when the body is not one. */
export function readLatestRelease(payload: unknown): LatestRelease | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const { tag_name: tag, html_url: url } = payload as Record<string, unknown>;
	if (typeof tag !== 'string' || tag === '') return null;
	return { tag, url: webUrlOrNull(url) };
}
