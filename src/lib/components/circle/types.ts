import type { ActionData, PageData } from '../../../routes/(app)/circles/[id]/$types';

/*
 * The circle page's parts read the page's own data and form result rather than restating every
 * shape (as the person page's do, `../person/types.ts`): what `load` produces stays the one
 * definition, and a part reading something `load` no longer sends fails `bun run check`.
 */

/** What the circle page's `load` hands its parts. */
export type CirclePageData = PageData;

/** The result of the page's last form action. */
export type CircleForm = ActionData;

/** One of the circle's photos, in the grid's order, with its role resolved. */
export type CirclePagePhoto = CirclePageData['photos']['photos'][number];

/** Opens the lightbox on `ids[at]`, walking `ids`; `opener` gets focus back if no tile does. */
export type OpenPhotos = (ids: string[], at: number, opener: HTMLElement) => void;
