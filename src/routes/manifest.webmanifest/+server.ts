import { json, type RequestHandler } from '@sveltejs/kit';
import { createTranslator } from '$lib/i18n/translate';
import { buildManifest } from '$lib/pwa/manifest';

/*
 * The install manifest (docs/02 §2.18). A route rather than a file in `static/` because the
 * launcher name and description are translated, and `locals.locale` is the only place that
 * knows which language this reader gets.
 *
 * It sits outside both route groups on purpose: the browser fetches it while rendering any
 * page, including the sign-in screen, and it says nothing about the household.
 */

/** Cached briefly so a cold install does not wait on the app, but a language change is not stuck for long. */
const CACHE_SECONDS = 60 * 60;

export const GET: RequestHandler = ({ locals }) =>
	json(buildManifest(createTranslator(locals.locale)), {
		headers: {
			'content-type': 'application/manifest+json',
			'cache-control': `private, max-age=${CACHE_SECONDS}`
		}
	});
