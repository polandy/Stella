import { TranslatableError } from '../../errors/translatable';
import { phrase } from '../../i18n/phrase';
import type { Clock } from '../clock';
import type { IdGenerator } from '../id';
import { generateSessionToken, hashSessionToken } from './tokens';

/*
 * API tokens (docs/02 §2.16.1) — how a script or an agent acts as a household member without
 * a browser. A token *is* its member: whatever it may reach, the member may, and nothing more.
 * It only ever signs in to the API (`/api/v1/`), never to the app's pages.
 *
 * Like a session, it is stored as the SHA-256 of the secret, so a copy of the database cannot
 * be replayed; unlike a session, it is shown exactly once, carries a name so the member can tell
 * their tokens apart, and has a fixed last day instead of sliding forward on use.
 */

/** Where the API lives; the only paths a token signs in to. */
export const API_PATH_PREFIX = '/api/v1/';

/** What every token starts with, so a leaked one is recognisable for what it is. */
const TOKEN_PREFIX = 'stella_';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The lifetimes a member can choose from, in days. */
export const API_TOKEN_LIFETIMES_DAYS = [30, 90, 365] as const;
export type ApiTokenLifetime = (typeof API_TOKEN_LIFETIMES_DAYS)[number];

/** A stored token. `tokenHash` is the SHA-256 of the secret, never the secret. */
export interface ApiTokenRecord {
	id: string;
	userId: string;
	name: string;
	tokenHash: string;
	createdAt: number;
	expiresAt: number;
	lastUsedAt: number | null;
}

/** A token as its member's list shows it. */
export type ApiTokenSummary = Pick<
	ApiTokenRecord,
	'id' | 'name' | 'createdAt' | 'expiresAt' | 'lastUsedAt'
>;

/** Persistence port for tokens; the edge wires a Drizzle adapter. */
export interface ApiTokenRepository {
	insert(record: ApiTokenRecord): Promise<void>;
	findByHash(tokenHash: string): Promise<ApiTokenRecord | null>;
	/** The member's tokens, newest first. */
	listForUser(userId: string): Promise<ApiTokenRecord[]>;
	/** Deletes the token if it is this member's; false when there was no such token of theirs. */
	deleteForUser(userId: string, id: string): Promise<boolean>;
	touch(id: string, at: number): Promise<void>;
}

export interface ApiTokenDeps {
	tokens: ApiTokenRepository;
	clock: Clock;
	ids: IdGenerator;
	/** The random part of a new token; injectable so a test knows what it is. */
	generateSecret?: () => string;
}

/** Thrown when a token is asked for without a name to tell it by. */
export class EmptyApiTokenNameError extends TranslatableError {
	constructor() {
		super(phrase('errors.apiToken.emptyName'), 'EmptyApiTokenNameError');
	}
}

/** Mint a token for a member. The returned `token` is the only time the secret is seen. */
export async function issueApiToken(
	deps: ApiTokenDeps,
	userId: string,
	input: { name: string; lifetimeDays: ApiTokenLifetime }
): Promise<{ id: string; token: string }> {
	const name = input.name.trim();
	if (name === '') throw new EmptyApiTokenNameError();
	const token = TOKEN_PREFIX + (deps.generateSecret ?? generateSessionToken)();
	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.tokens.insert({
		id,
		userId,
		name,
		tokenHash: hashSessionToken(token),
		createdAt: now,
		expiresAt: now + input.lifetimeDays * DAY_MS,
		lastUsedAt: null
	});
	return { id, token };
}

/** The member a token acts as, or null when it is unknown, withdrawn or past its day. */
export async function authenticateApiToken(
	deps: ApiTokenDeps,
	token: string
): Promise<string | null> {
	if (!token.startsWith(TOKEN_PREFIX)) return null;
	const record = await deps.tokens.findByHash(hashSessionToken(token));
	if (!record) return null;
	const now = deps.clock.now();
	if (now >= record.expiresAt) return null;
	await deps.tokens.touch(record.id, now);
	return record.userId;
}

/** A member's own tokens, without anything that could be used to sign in. */
export async function listApiTokens(
	deps: ApiTokenDeps,
	userId: string
): Promise<ApiTokenSummary[]> {
	return (await deps.tokens.listForUser(userId)).map(
		({ id, name, createdAt, expiresAt, lastUsedAt }) => ({
			id,
			name,
			createdAt,
			expiresAt,
			lastUsedAt
		})
	);
}

/** Withdraw one of the member's tokens. False when they have no such token. */
export function revokeApiToken(deps: ApiTokenDeps, userId: string, id: string): Promise<boolean> {
	return deps.tokens.deleteForUser(userId, id);
}

/** The token in an `Authorization: Bearer …` header, or null when there is none. */
export function bearerTokenOf(header: string | null): string | null {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
	return match ? match[1] : null;
}
