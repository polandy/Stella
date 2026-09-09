import { buildEndSessionUrl } from './logout-url';
import type { OidcProvider } from './login';

/*
 * RP-initiated logout (docs/02 §2.1). Signing out of Stella always succeeds locally; this
 * only decides whether to also bounce the browser through the provider so the SSO session
 * ends there too. Everything that can go wrong here degrades to a local sign-out.
 */

/**
 * Where the browser lands once it is signed out, locally or on the way back from the
 * provider. Registered at the provider as the post-logout redirect URI (docs/07).
 */
export const SIGNED_OUT_PATH = '/login?signedOut=1';

export interface RpLogoutDeps {
	provider: Pick<OidcProvider, 'endSessionEndpoint'>;
	/** Honours OIDC_RP_LOGOUT; false keeps sign-out local even for a federated session. */
	enabled: boolean;
	clientId: string;
	postLogoutRedirectUri: string;
}

/** The provider logout URL to redirect to, or null when the sign-out stays local. */
export async function planRpLogout(
	deps: RpLogoutDeps,
	idToken: string | null
): Promise<string | null> {
	if (!deps.enabled || !idToken) return null;

	let endSessionEndpoint: string | null;
	try {
		endSessionEndpoint = await deps.provider.endSessionEndpoint();
	} catch (error) {
		// The local session is already gone; an unreachable provider must not break sign-out.
		console.error('OIDC discovery failed during logout; signing out locally only.', error);
		return null;
	}

	return buildEndSessionUrl({
		endSessionEndpoint,
		idToken,
		clientId: deps.clientId,
		postLogoutRedirectUri: deps.postLogoutRedirectUri
	});
}
