/*
 * Links into Immich's web app (docs/concepts/immich.md §2 point 5). Pure: the base comes from
 * `IMMICH_PUBLIC_URL`, which may differ from the address the server calls Immich at. A link
 * opens only for someone signed into the key owner's account, so the caller decides who sees it.
 * Phone app links wait for the device test (§4.4, §9.6).
 */

/** The person's page in Immich's web app, `{publicUrl}/people/{id}`. */
export function immichPersonUrl(publicUrl: string, personId: string): string {
	return `${publicUrl.replace(/\/+$/, '')}/people/${encodeURIComponent(personId)}`;
}
