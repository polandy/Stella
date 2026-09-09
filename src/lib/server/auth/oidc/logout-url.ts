/*
 * Build the provider's RP-initiated logout redirect (docs/02 §2.1). Pure — given what the
 * discovery document advertised and what the session carries, it either returns the URL to
 * bounce the browser through or null, meaning: sign out locally and be done.
 */

export interface EndSessionUrlParams {
	/** From discovery; null when the provider advertises no logout endpoint. */
	endSessionEndpoint: string | null;
	/** The ID token of the sign-in behind this session; null for a local sign-in. */
	idToken: string | null;
	clientId: string;
	/** Where the provider should return the browser once it has signed the user out. */
	postLogoutRedirectUri: string;
}

/** The logout URL, or null when there is no provider round-trip to make. */
export function buildEndSessionUrl(params: EndSessionUrlParams): string | null {
	if (!params.endSessionEndpoint || !params.idToken) return null;

	let url: URL;
	try {
		url = new URL(params.endSessionEndpoint);
	} catch {
		return null;
	}

	url.searchParams.set('id_token_hint', params.idToken);
	url.searchParams.set('post_logout_redirect_uri', params.postLogoutRedirectUri);
	url.searchParams.set('client_id', params.clientId);
	return url.toString();
}
