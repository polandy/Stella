import type { Clock } from '../../clock';
import type { LatestRelease, ReleaseFeed } from './feed';
import { isNewerRelease } from './version';

/*
 * "Is there a newer Stella?" (docs/02 §2.17.1). The use-case owns the two things that make
 * the question cheap: it asks the feed at most once a day, and it remembers the answer
 * across requests. The asking itself is a port, so this file never touches the network.
 */

/** How long an answer is kept before the feed is asked again. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * What Settings can say about the release. An instance that makes no check at all has no
 * status — the edge says that, rather than a fourth state nothing here can produce.
 */
export type UpdateState = 'current' | 'available' | 'unreachable';

interface StatusBase {
	/** The version this instance is running. */
	current: string;
	/** Where to read about the newest release, or null when the feed named no usable page. */
	releaseUrl: string | null;
	/** When the feed last answered, as epoch milliseconds; null when it never has. */
	checkedAt: number | null;
	/** The most recent attempt failed, so what is shown is older than it looks. */
	stale: boolean;
}

/**
 * The answer Settings renders. `available` carries the release it found, so the line has
 * nothing to fall back on; the other two may have nothing to name at all.
 */
export type UpdateStatus =
	| (StatusBase & { state: 'available'; latest: string; checkedAt: number })
	| (StatusBase & { state: 'current' | 'unreachable'; latest: string | null });

export interface UpdateCheckDeps {
	feed: ReleaseFeed;
	clock: Clock;
	/** The version this build is, as `X.Y.Z`. */
	currentVersion: string;
}

/** Asks for the newest release, remembers it, and says what it means for this instance. */
export interface UpdateCheck {
	status(): Promise<UpdateStatus>;
}

export function createUpdateCheck({ feed, clock, currentVersion }: UpdateCheckDeps): UpdateCheck {
	let known: LatestRelease | null = null;
	let checkedAt: number | null = null;
	/* When the feed was last *asked*, answered or not — a failure must not re-ask on every
	 * page load, or one unreachable moment turns into a request per visitor. */
	let askedAt: number | null = null;
	/* The most recent attempt failed, so what is remembered is older than this round. */
	let stale = false;
	/* The request in flight. Two pages opening at once share it rather than asking twice. */
	let asking: Promise<void> | null = null;

	async function ask(): Promise<void> {
		askedAt = clock.now();
		try {
			const latest = await feed.latest();
			checkedAt = clock.now();
			stale = false;
			// A feed with no release at all is an answer, not a failure: nothing to offer.
			if (latest) known = latest;
		} catch {
			// Leave what we already know standing, marked as the older answer it now is; the
			// state below decides whether it is still worth saying.
			stale = true;
		}
	}

	return {
		async status(): Promise<UpdateStatus> {
			const due = askedAt === null || clock.now() - askedAt >= CHECK_INTERVAL_MS;
			// The latch is cleared where it was set, so a request that fails still frees the
			// next one: a stale resolved promise here would wedge the check for good.
			if (due && !asking) asking = ask().finally(() => (asking = null));
			if (asking) await asking;

			// A release we already know outranks a check that has since failed: the notice is
			// still true, and withdrawing it for a day would help nobody.
			if (known !== null && checkedAt !== null && isNewerRelease(currentVersion, known.tag)) {
				return {
					state: 'available',
					current: currentVersion,
					latest: known.tag,
					releaseUrl: known.url,
					checkedAt,
					stale
				};
			}

			return {
				state: checkedAt !== null ? 'current' : 'unreachable',
				current: currentVersion,
				latest: known?.tag ?? null,
				releaseUrl: known?.url ?? null,
				checkedAt,
				stale
			};
		}
	};
}
