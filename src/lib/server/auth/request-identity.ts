import type { AuthUser } from './accounts';
import {
	API_PATH_PREFIX,
	authenticateApiToken,
	bearerTokenOf,
	type ApiTokenDeps
} from './api-tokens';
import { validateSessionToken, type SessionDeps } from './session';

/*
 * Who a request is (docs/04 §4.4). Two credentials, each with its own territory: the session
 * cookie signs in to the app's pages, an API token to `/api/v1/` (docs/02 §2.16.1) — and
 * neither is read on the other's side. On the API the cookie is ignored, so a signed-in
 * browser cannot be steered into it by another site; on a page a token is ignored, so a token
 * handed to a script opens nothing but the API.
 */

export interface RequestIdentityDeps {
	apiTokens: ApiTokenDeps;
	sessions: SessionDeps;
	findUser(id: string): Promise<AuthUser | null>;
}

/** What a request carries that could say who it is. */
export interface RequestCredentials {
	pathname: string;
	/** The `Authorization` header, as sent. */
	authorization: string | null;
	/** The session cookie's value, as sent. */
	sessionToken: string | undefined;
}

export interface RequestIdentity {
	user: AuthUser | null;
	/** Whether the request is to the API, where only a token counts. */
	viaApi: boolean;
	/** The page request carried a session cookie that signs nobody in any more. */
	staleSessionCookie: boolean;
}

/** Resolve a request's credentials to its member, by the rules in the module comment. */
export async function resolveRequestIdentity(
	deps: RequestIdentityDeps,
	credentials: RequestCredentials
): Promise<RequestIdentity> {
	if (credentials.pathname.startsWith(API_PATH_PREFIX)) {
		const bearer = bearerTokenOf(credentials.authorization);
		const userId = bearer ? await authenticateApiToken(deps.apiTokens, bearer) : null;
		const user = userId ? await deps.findUser(userId) : null;
		return { user, viaApi: true, staleSessionCookie: false };
	}
	if (!credentials.sessionToken) return { user: null, viaApi: false, staleSessionCookie: false };
	const session = await validateSessionToken(deps.sessions, credentials.sessionToken);
	const user = session ? await deps.findUser(session.userId) : null;
	return { user, viaApi: false, staleSessionCookie: user === null };
}
