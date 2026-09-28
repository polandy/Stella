/*
 * Reading and comparing release numbers (docs/02 §2.17.1). Pure — no clock, no network.
 *
 * Stella's releases are cut by release-please as `X.Y.Z`, and a release candidate as
 * `X.Y.Z-rc.N` (docs/04 §4.9), so that is the whole grammar here. Anything else — a
 * development build, another pre-release tag, a hand-made tag — is deliberately unreadable
 * rather than guessed at, and an unreadable version on either side never produces an
 * "update available".
 */

/** A release number, once it has been read. */
export interface ReleaseVersion {
	major: number;
	minor: number;
	patch: number;
	/** The `N` of an `X.Y.Z-rc.N` candidate, which comes before `X.Y.Z`; null for a release. */
	candidate: number | null;
}

const RELEASE = /^v?(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/;

/** A `X.Y.Z` release or `X.Y.Z-rc.N` candidate (either with a `v`), or null when it is neither. */
export function parseVersion(raw: string): ReleaseVersion | null {
	const match = RELEASE.exec(raw);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		candidate: match[4] === undefined ? null : Number(match[4])
	};
}

/** Whether `latest` is a release after `current`. False whenever either cannot be read. */
export function isNewerRelease(current: string, latest: string): boolean {
	const here = parseVersion(current);
	const there = parseVersion(latest);
	if (!here || !there) return false;

	if (there.major !== here.major) return there.major > here.major;
	if (there.minor !== here.minor) return there.minor > here.minor;
	if (there.patch !== here.patch) return there.patch > here.patch;
	// Same numbers: the release outranks every candidate of it, and candidates count up.
	if (there.candidate === null) return here.candidate !== null;
	return here.candidate !== null && there.candidate > here.candidate;
}
