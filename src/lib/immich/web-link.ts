/*
 * Links into Immich's web app (docs/concepts/immich.md §2 point 5). Pure: the base comes from
 * `IMMICH_PUBLIC_URL`, which may differ from the address the server calls Immich at. Every
 * member who sees a linked person gets the link; it opens Immich as it is, so someone not
 * signed into the key owner's account lands on Immich's sign-in or an empty page.
 * Phone app links wait for the device test (§4.4, §9.6).
 */

/** The person's page in Immich's web app, `{publicUrl}/people/{id}`. */
export function immichPersonUrl(publicUrl: string, personId: string): string {
	return `${publicUrl.replace(/\/+$/, '')}/people/${encodeURIComponent(personId)}`;
}
