/*
 * Where the browser asks for a face from Immich: Stella's own route, which fetches it with the
 * key the browser never sees (docs/concepts/immich.md §2 point 3). The one place this URL is
 * spelled; the route lives at `src/routes/media/immich/people/[personId]/thumbnail`.
 */

/** A person's face thumbnail, through Stella. */
export function immichFaceUrl(personId: string): string {
	return `/media/immich/people/${encodeURIComponent(personId)}/thumbnail`;
}
