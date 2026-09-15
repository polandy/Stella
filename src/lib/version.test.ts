import { describe, expect, it } from 'bun:test';
import { parseVersion } from './server/domain/release/version';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
	it('is a release number the update check can read', () => {
		// If release-please ever writes something else into package.json — a pre-release
		// suffix, say — the release check would switch itself off without a word, because an
		// unreadable version is never compared. This is where that is noticed.
		expect(parseVersion(APP_VERSION)).not.toBeNull();
	});
});
