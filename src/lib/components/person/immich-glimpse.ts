import type { ImmichGlimpse } from '$lib/immich/strip';

/*
 * A page of a linked person's latest photos from Immich, with signed URLs, as the strip under the
 * gallery and the picture's chooser both ask for it (docs/02 §2.24.3, §2.24.6). Null when it
 * could not be had, which both take quietly: the Photos card's line already says what is wrong.
 */
export async function fetchGlimpse(
	contactId: string,
	cursor: string | null,
	/** The other person, for the photos of the two together (§2.24.7). */
	togetherWith: string | null = null
): Promise<ImmichGlimpse | null> {
	const params = new URLSearchParams();
	if (cursor !== null) params.set('cursor', cursor);
	if (togetherWith !== null) params.set('with', togetherWith);
	const query = params.size === 0 ? '' : `?${params}`;
	try {
		const response = await fetch(`/contacts/${encodeURIComponent(contactId)}/immich/photos${query}`);
		return response.ok ? ((await response.json()) as ImmichGlimpse) : null;
	} catch {
		// The network went away mid-request: the page is about to say Stella is offline.
		return null;
	}
}
