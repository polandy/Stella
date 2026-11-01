import { type ApiTokenDeps, type ApiTokenRecord } from './api-tokens';
import { generateSessionToken, hashSessionToken } from './tokens';

/*
 * The calendar link (docs/02 §2.13.4) — the secret in a member's `/cal/<secret>.ics` URL, which
 * their phone's calendar fetches without anyone signing in. It is a token of its own scope in
 * the API token table: it opens only that member's feed, and an API token never opens it.
 *
 * Stored hashed like every token, so it is shown once; a member who lost it creates a new one.
 * One per member, and no last day: a subscription that lapsed silently would just stop telling
 * the member about birthdays, so it lasts until they revoke or replace it.
 */

/** Where the feeds live; the only paths a calendar link opens. */
export const CALENDAR_PATH_PREFIX = '/cal/';

/** What every calendar link's secret starts with, so a leaked one is recognisable. */
const LINK_PREFIX = 'stellacal_';

/** The name it carries in the token table; nobody chooses it. */
const LINK_NAME = 'Calendar';

/** The member's link as Settings shows it — without the secret, which is gone. */
export interface CalendarLinkSummary {
	createdAt: number;
	lastUsedAt: number | null;
}

/**
 * Create the member's calendar link, replacing the one they had. The returned secret is the
 * only time it is seen.
 */
export async function issueCalendarLink(deps: ApiTokenDeps, userId: string): Promise<string> {
	const token = LINK_PREFIX + (deps.generateSecret ?? generateSessionToken)();
	const record: ApiTokenRecord = {
		id: deps.ids.next(),
		userId,
		name: LINK_NAME,
		tokenHash: hashSessionToken(token),
		scope: 'calendar',
		createdAt: deps.clock.now(),
		expiresAt: null,
		lastUsedAt: null
	};
	await deps.tokens.replaceForUser(record);
	return token;
}

/** The member's calendar link, or null when they have none. */
export async function calendarLinkOf(
	deps: ApiTokenDeps,
	userId: string
): Promise<CalendarLinkSummary | null> {
	const [link] = await deps.tokens.listForUser(userId, 'calendar');
	return link ? { createdAt: link.createdAt, lastUsedAt: link.lastUsedAt } : null;
}

/** Withdraw the member's calendar link at once. False when they had none. */
export function revokeCalendarLink(deps: ApiTokenDeps, userId: string): Promise<boolean> {
	return deps.tokens.deleteScopeForUser(userId, 'calendar');
}

/** The member whose feed this secret opens, or null when it is unknown or withdrawn. */
export async function authenticateCalendarLink(
	deps: ApiTokenDeps,
	token: string
): Promise<string | null> {
	if (!token.startsWith(LINK_PREFIX)) return null;
	const record = await deps.tokens.findByHash(hashSessionToken(token));
	if (!record || record.scope !== 'calendar') return null;
	await deps.tokens.touch(record.id, deps.clock.now());
	return record.userId;
}
