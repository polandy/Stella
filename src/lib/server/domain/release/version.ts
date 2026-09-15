/*
 * Reading and comparing release numbers (docs/02 §2.17.1). Pure — no clock, no network.
 *
 * Stella's releases are cut by release-please and are always `X.Y.Z`, so that is the whole
 * grammar here. Anything else — a development build, a pre-release tag, a hand-made tag —
 * is deliberately unreadable rather than guessed at, and an unreadable version on either
 * side never produces an "update available".
 */

/** A release number, once it has been read. */
export interface ReleaseVersion {
	major: number;
	minor: number;
	patch: number;
}

const RELEASE = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** The three numbers of a `X.Y.Z` (or `vX.Y.Z`) release, or null when it is not one. */
export function parseVersion(raw: string): ReleaseVersion | null {
	const match = RELEASE.exec(raw);
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Whether `latest` is a release after `current`. False whenever either cannot be read. */
export function isNewerRelease(current: string, latest: string): boolean {
	const here = parseVersion(current);
	const there = parseVersion(latest);
	if (!here || !there) return false;

	if (there.major !== here.major) return there.major > here.major;
	if (there.minor !== here.minor) return there.minor > here.minor;
	return there.patch > here.patch;
}
