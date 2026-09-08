import type { Clock } from '../clock';
import { newExpiry, validateExpiry } from './session-policy';
import { generateSessionToken, hashSessionToken } from './tokens';

/*
 * Session service — the use-case layer for the session lifecycle. It composes the pure
 * token hashing and expiry policy with persistence through the SessionRepository port
 * (docs/08 §8.3). It never touches the DB directly; the edge wires a concrete repository.
 */

/** A persisted session. `id` is the SHA-256 of the token, never the raw token. */
export interface SessionRecord {
	id: string;
	userId: string;
	expiresAt: number;
	/**
	 * The ID token of the OIDC sign-in that opened this session, kept as the
	 * `id_token_hint` for RP-initiated logout (docs/02 §2.1); null for a local sign-in.
	 */
	oidcIdToken: string | null;
}

/** Persistence port for sessions; implemented by a Drizzle adapter at the edge. */
export interface SessionRepository {
	create(session: SessionRecord): Promise<void>;
	findById(id: string): Promise<SessionRecord | null>;
	updateExpiry(id: string, expiresAt: number): Promise<void>;
	delete(id: string): Promise<void>;
}

export interface SessionDeps {
	sessions: SessionRepository;
	clock: Clock;
	/** Token source; defaults to a secure random generator. Injectable for tests. */
	generateToken?: () => string;
}

/**
 * Create a new session for a user and return the raw token to put in the cookie.
 * `oidcIdToken` is the ID token of a federated sign-in; local sign-ins pass nothing.
 */
export async function createSession(
	deps: SessionDeps,
	userId: string,
	oidcIdToken: string | null = null
): Promise<{ token: string; session: SessionRecord }> {
	const token = (deps.generateToken ?? generateSessionToken)();
	const session: SessionRecord = {
		id: hashSessionToken(token),
		userId,
		expiresAt: newExpiry(deps.clock.now()),
		oidcIdToken
	};
	await deps.sessions.create(session);
	return { token, session };
}

/**
 * Resolve a cookie token to its session, applying the expiry policy: expired sessions are
 * deleted and rejected; sessions past halfway are slid forward; otherwise returned as-is.
 */
export async function validateSessionToken(
	deps: SessionDeps,
	token: string
): Promise<SessionRecord | null> {
	const id = hashSessionToken(token);
	const stored = await deps.sessions.findById(id);
	if (!stored) return null;

	const decision = validateExpiry(stored, deps.clock.now());
	if (decision.status === 'expired') {
		await deps.sessions.delete(id);
		return null;
	}
	if (decision.status === 'refresh') {
		await deps.sessions.updateExpiry(id, decision.expiresAt);
		return { ...stored, expiresAt: decision.expiresAt };
	}
	return stored;
}

/**
 * Sign out: revoke the session behind a cookie token and report the OIDC ID token it
 * carried, which the caller needs as the `id_token_hint` for RP-initiated logout
 * (docs/02 §2.1). A token with no session behind it is a no-op.
 */
export async function signOut(
	deps: SessionDeps,
	token: string
): Promise<{ oidcIdToken: string | null }> {
	const id = hashSessionToken(token);
	const stored = await deps.sessions.findById(id);
	await deps.sessions.delete(id);
	return { oidcIdToken: stored?.oidcIdToken ?? null };
}
