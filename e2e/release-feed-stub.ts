import { STUB_RELEASE_TAG, STUB_RELEASE_URL } from './release-feed';

/*
 * A stand-in for GitHub's `releases/latest`, so the e2e suite can see the About card in its
 * "a newer release exists" state without reaching the network — and without waiting on
 * whatever GitHub happens to be publishing today (docs/02 §2.17.1).
 *
 * Started beside the app by `playwright.config.ts` and by `e2e/run.sh`; the app is pointed
 * at it with `UPDATE_FEED_URL`. It answers one shape and never changes its mind, so the
 * assertions name a fixed version rather than a moving one.
 */

const port = Number(process.env.PORT ?? 4174);

Bun.serve({
	port,
	hostname: '127.0.0.1',
	fetch() {
		return Response.json({ tag_name: STUB_RELEASE_TAG, html_url: STUB_RELEASE_URL });
	}
});

console.log(`▶ release feed stub on http://127.0.0.1:${port}`);
