import type { GlimpseScope, ImmichGlimpse } from '$lib/immich/strip';

/*
 * A page of a linked person's latest photos from Immich, with signed URLs, as the Photos card,
 * the picture's chooser and *Find in Immich* ask for it (docs/02 §2.24.2, §2.24.3, §2.24.6). Null when it
 * could not be had, which both take quietly: the Photos card's line already says what is wrong.
 */
export async function fetchGlimpse(
	contactId: string,
	cursor: string | null,
	/** Their photos together with someone (§2.24.8), or someone else's for their picture (§2.24.2). */
	scope: GlimpseScope = null
): Promise<ImmichGlimpse | null> {
	const params = new URLSearchParams();
	if (cursor !== null) params.set('cursor', cursor);
	if (scope !== null && 'with' in scope) params.set('with', scope.with);
	if (scope !== null && 'of' in scope) params.set('of', scope.of);
	const query = params.size === 0 ? '' : `?${params}`;
	try {
		const response = await fetch(
			`/contacts/${encodeURIComponent(contactId)}/immich/photos${query}`
		);
		return response.ok ? ((await response.json()) as ImmichGlimpse) : null;
	} catch {
		// The network went away mid-request: the page is about to say Stella is offline.
		return null;
	}
}
