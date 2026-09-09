import type { LayoutServerLoad } from './$types';

/*
 * The language every page is rendered in (docs/02 §2.19), settled per request in
 * `hooks.server.ts` and handed to the root layout, which provides the translator to the
 * component tree. It sits at the root so the sign-in screens speak it too.
 */

export const load: LayoutServerLoad = ({ locals }) => ({ locale: locals.locale });
