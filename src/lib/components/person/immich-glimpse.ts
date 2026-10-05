import type { ImmichGlimpse } from '$lib/immich/strip';

/*
 * A page of a linked person's latest photos from Immich, with signed URLs, as the strip under the
 * gallery and the picture's chooser both ask for it (docs/02 §2.24.3, §2.24.6). Null when it
 * could not be had, which both take quietly: the Photos card's line already says what is wrong.
 */
export async function fetchGlimpse(contactId: string, cursor: string | null): Promise<ImmichGlimpse | null> {
	const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`;
	try {
		const response = await fetch(`/contacts/${encodeURIComponent(contactId)}/immich/photos${query}`);
		return response.ok ? ((await response.json()) as ImmichGlimpse) : null;
	} catch {
		// The network went away mid-request: the page is about to say Stella is offline.
		return null;
	}
}
