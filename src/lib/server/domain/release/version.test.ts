import { describe, expect, it } from 'bun:test';
import { isNewerRelease, parseVersion } from './version';

describe('parseVersion', () => {
	it('reads a plain release, with or without the tag prefix', () => {
		expect(parseVersion('0.0.10')).toEqual({ major: 0, minor: 0, patch: 10, candidate: null });
		expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, candidate: null });
	});

	it('reads a release candidate, which is how a candidate build names itself', () => {
		// Cut with a `Release-As: X.Y.Z-rc.N` footer (docs/04 §4.9). Unreadable, it would switch
		// the release check off on exactly the builds that most need to hear of the final one.
		expect(parseVersion('0.0.19-rc.1')).toEqual({ major: 0, minor: 0, patch: 19, candidate: 1 });
		expect(parseVersion('v1.2.3-rc.12')).toEqual({ major: 1, minor: 2, patch: 3, candidate: 12 });
	});

	it('refuses anything that is not three numbers and an optional candidate number', () => {
		for (const raw of ['', 'dev', '1.2', '1.2.3.4', 'v1.2.x', '1.2.3-rc', '1.2.3-beta.1', '1.2.3-rc.1.2', ' 1.2.3']) {
			expect(parseVersion(raw)).toBeNull();
		}
	});
});

describe('isNewerRelease', () => {
	it('compares numerically, not as text', () => {
		// The reason this rule has its own test: as strings, "9" sorts after "10".
		expect(isNewerRelease('0.9.0', '0.10.0')).toBe(true);
		expect(isNewerRelease('0.10.0', '0.9.0')).toBe(false);
	});

	it('sees a newer major, minor and patch', () => {
		expect(isNewerRelease('1.2.3', '2.0.0')).toBe(true);
		expect(isNewerRelease('1.2.3', '1.3.0')).toBe(true);
		expect(isNewerRelease('1.2.3', '1.2.4')).toBe(true);
	});

	it('calls the same release, and an older one, no update', () => {
		expect(isNewerRelease('1.2.3', 'v1.2.3')).toBe(false);
		expect(isNewerRelease('1.2.3', '1.2.2')).toBe(false);
	});

	it('sees the final release as newer than its own candidates, and a later candidate as newer', () => {
		expect(isNewerRelease('0.0.19-rc.1', '0.0.19')).toBe(true);
		expect(isNewerRelease('0.0.19-rc.1', '0.0.19-rc.2')).toBe(true);
		expect(isNewerRelease('0.0.19', '0.0.19-rc.2')).toBe(false);
	});

	it('calls the release before a candidate no update', () => {
		expect(isNewerRelease('0.0.19-rc.1', '0.0.18')).toBe(false);
		expect(isNewerRelease('0.0.19-rc.1', '0.0.19-rc.1')).toBe(false);
	});

	it('never claims an update when either side cannot be read', () => {
		// A build nobody stamped, and a tag nobody can parse, both stay quiet rather than
		// guessing: a wrong "you are behind" costs more than a missed notice.
		expect(isNewerRelease('dev', '1.2.3')).toBe(false);
		expect(isNewerRelease('1.2.3', 'nightly')).toBe(false);
	});
});
