/*
 * Build the provider authorization redirect URL for the Authorization Code + PKCE flow
 * (docs/04 §4.4). Pure — given the endpoint and parameters, returns the URL string.
 */

export interface AuthorizationUrlParams {
	authorizationEndpoint: string;
	clientId: string;
	redirectUri: string;
	scopes: string;
	state: string;
	nonce: string;
	codeChallenge: string;
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
	const url = new URL(params.authorizationEndpoint);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', params.clientId);
	url.searchParams.set('redirect_uri', params.redirectUri);
	url.searchParams.set('scope', params.scopes);
	url.searchParams.set('state', params.state);
	url.searchParams.set('nonce', params.nonce);
	url.searchParams.set('code_challenge', params.codeChallenge);
	url.searchParams.set('code_challenge_method', 'S256');
	return url.toString();
}
