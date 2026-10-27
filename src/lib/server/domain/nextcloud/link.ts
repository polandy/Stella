import type { NextcloudSource } from '../../../import-match/card';
import type { Viewer } from '../../access/visibility';
import { AddressBookUnreachableError } from './address-book';
import { unansweredCards } from './review';
import {
	syncNextcloud,
	type NextcloudSyncDeps,
	type NextcloudSyncOutcome,
	type NextcloudSyncRequest
} from './sync';
import type { SystemActors } from './system-actor';

/*
 * The household's link to its Nextcloud address book (docs/02 §2.16.3): synced when a member
 * asks (*Sync now*) and when Stella is opened — the latter at most every few minutes, and sooner
 * again after the book could not be reached. A sync already running for the household is joined,
 * never started twice, and every sync runs as the Nextcloud actor. Built once per process; what
 * it remembers between requests is only when it last tried and whether that failed.
 */

/** How long after a sync opening Stella does not sync again. */
export const SYNC_ON_OPEN_INTERVAL_MS = 10 * 60 * 1000;

/** How long after a failed sync opening Stella tries again. */
export const FAILURE_RETRY_MS = 60 * 1000;

export interface NextcloudLinkDeps extends NextcloudSyncDeps {
	actors: SystemActors;
	source: NextcloudSource;
}

/** What the sync needs from the member's request: the words it writes in their language. */
export type LinkSyncRequest = Pick<NextcloudSyncRequest, 'wording' | 'locale'>;

export type LinkSyncResult = { ok: true; outcome: NextcloudSyncOutcome } | { ok: false };

/** What the import page says about the link. */
export interface NextcloudStatus {
	source: NextcloudSource;
	/** When the last sync finished; null before the first. */
	syncedAt: number | null;
	/** Whether the last attempt could not reach the book. */
	failing: boolean;
	/** Cards waiting in the matching review. */
	newCards: number;
	/** Conflicts waiting under Data quality about people the viewer may browse. */
	conflicts: number;
}

export interface NextcloudLink {
	source: NextcloudSource;
	/** Sync now; joins the household's sync when one is running. */
	sync(householdId: string, request: LinkSyncRequest): Promise<LinkSyncResult>;
	/** Sync on opening Stella, when it is due; null when it is not. */
	syncIfDue(householdId: string, request: LinkSyncRequest): Promise<LinkSyncResult | null>;
	status(viewer: Viewer): Promise<NextcloudStatus>;
}

export function createNextcloudLink(deps: NextcloudLinkDeps): NextcloudLink {
	const { source, clock } = deps;
	const running = new Map<string, Promise<LinkSyncResult>>();
	const lastTry = new Map<string, { at: number; failed: boolean }>();

	async function run(householdId: string, request: LinkSyncRequest): Promise<LinkSyncResult> {
		const at = clock.now();
		try {
			const system = await deps.actors.nextcloud(householdId);
			const outcome = await syncNextcloud(deps, { ...request, system, source });
			lastTry.set(householdId, { at, failed: false });
			return { ok: true, outcome };
		} catch (err) {
			lastTry.set(householdId, { at, failed: true });
			if (err instanceof AddressBookUnreachableError) return { ok: false };
			throw err;
		} finally {
			running.delete(householdId);
		}
	}

	const sync = (householdId: string, request: LinkSyncRequest) => {
		const current = running.get(householdId);
		if (current) return current;
		const started = run(householdId, request);
		running.set(householdId, started);
		return started;
	};

	return {
		source,
		sync,

		async syncIfDue(householdId, request) {
			const last = lastTry.get(householdId);
			const at = last?.at ?? (await deps.store.syncedAt(householdId, source));
			const wait = last?.failed ? FAILURE_RETRY_MS : SYNC_ON_OPEN_INTERVAL_MS;
			if (at !== null && clock.now() - at < wait) return null;
			return sync(householdId, request);
		},

		async status(viewer) {
			const [syncedAt, text, conflicts] = await Promise.all([
				deps.store.syncedAt(viewer.householdId, source),
				unansweredCards(deps, viewer, source),
				deps.store.conflicts(viewer)
			]);
			return {
				source,
				syncedAt,
				failing: lastTry.get(viewer.householdId)?.failed ?? false,
				newCards: text.match(/^BEGIN:VCARD/gim)?.length ?? 0,
				conflicts: conflicts.length
			};
		}
	};
}
