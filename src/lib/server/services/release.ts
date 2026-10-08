import type { Clock } from '../clock';
import type { Config } from '../config';
import { createUpdateCheck, type UpdateCheck } from '../domain/release/update-check';
import { parseVersion } from '../domain/release/version';
import { createGitHubReleaseFeed } from '../release/github-feed';

/*
 * The `release` bounded context of the composition root (docs/08 §8.3): "is there a newer
 * Stella?" (docs/02 §2.17.1). Built once per process by `createServices` — which is the point,
 * because the answer the check caches is shared by every request; the edge reads it off
 * `locals.services.release`.
 */
export interface ReleaseServices {
	/**
	 * The release check, or null when this instance makes none: either the operator did not
	 * ask for it, or this build carries no readable release number and has nothing to compare.
	 */
	updateCheck: UpdateCheck | null;
}

/** The part of the configuration the release context reads. */
export type ReleaseWiringConfig = Pick<Config, 'updateCheck' | 'updateFeedUrl'>;

export interface ReleaseWiring {
	config: ReleaseWiringConfig;
	clock: Clock;
	/** The version this build is (`APP_VERSION`), what the newest release is compared with. */
	version: string;
}

export function createReleaseServices({ config, clock, version }: ReleaseWiring): ReleaseServices {
	if (!config.updateCheck || !parseVersion(version)) return { updateCheck: null };
	return {
		updateCheck: createUpdateCheck({
			feed: createGitHubReleaseFeed({ version, url: config.updateFeedUrl || undefined }),
			clock,
			currentVersion: version
		})
	};
}
