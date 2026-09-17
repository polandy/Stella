import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import type { PageServerLoad } from './$types';

/**
 * A workbench for things that are hard to catch in the real app — the activity indicator only shows
 * for work that lasts, and a local save is over in tens of milliseconds.
 *
 * In `bun run dev` it is simply there. A build serves it only with `DEBUG_PAGES=true`, which a
 * manual-verification server may set and a household's never does; otherwise the route answers
 * 404, as if it did not exist.
 */
export const load: PageServerLoad = () => {
	if (!dev && !getConfig().debugPages) throw error(404, 'Not found');
	return {};
};
