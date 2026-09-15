/*
 * What the suite's stand-in release feed answers. Kept apart from the server that serves it
 * (`release-feed-stub.ts`), because the specs import these constants under Node, which has
 * no `Bun.serve` to run past.
 */

/** The release the suite pretends is out. Far enough ahead to stay newer than any real one. */
export const STUB_RELEASE_TAG = 'v9.9.9';

/** Where the stub says the release can be read about. */
export const STUB_RELEASE_URL = `https://github.com/polandy/Stella/releases/tag/${STUB_RELEASE_TAG}`;
