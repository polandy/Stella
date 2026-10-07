/*
 * Links into Immich's web app (docs/02 §2.24.3). Pure: the base comes from
 * `IMMICH_PUBLIC_URL`, which may differ from the address the server calls Immich at. Every
 * member who sees a linked person gets the link; it opens Immich as it is, so someone not
 * signed into the key owner's account lands on Immich's sign-in or an empty page.
 * Phone app links wait for the device test (docs/02 §2.24.3).
 */

/** The person's page in Immich's web app, `{publicUrl}/people/{id}`. */
export function immichPersonUrl(publicUrl: string, personId: string): string {
	return `${publicUrl.replace(/\/+$/, '')}/people/${encodeURIComponent(personId)}`;
}

/** One photo in Immich's web app, `{publicUrl}/photos/{assetId}`. */
export function immichPhotoUrl(publicUrl: string, assetId: string): string {
	return `${publicUrl.replace(/\/+$/, '')}/photos/${encodeURIComponent(assetId)}`;
}
