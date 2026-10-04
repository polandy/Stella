import type { Clock } from '../../clock';
import type { ImmichGateway, ImmichOwner, ImmichScope, ImmichVersion } from './gateway';

/*
 * "Is Stella connected to Immich, and to whose?" (docs/concepts/immich.md §4.1). Settings shows
 * the answer as one line to every member. The answer is kept for a while, so opening pages does
 * not turn into a round of calls to Immich each time.
 */

/** The oldest Immich Stella speaks to (decision §9.5): one code path, the v3.2 search form. */
export const MINIMUM_VERSION: ImmichVersion = { major: 3, minor: 2, patch: 0 };

/** How long a good answer is kept. The key and the server rarely change; a restart is needed anyway. */
export const STATUS_INTERVAL_MS = 5 * 60 * 1000;

/** How long a failure is kept: short, so an Immich that comes back is seen soon after. */
export const FAILURE_RETRY_MS = 30 * 1000;

/** What Settings can say. Each failure has its own sentence, naming what to fix. */
export type ImmichStatus =
	| { state: 'connected'; version: string; owner: ImmichOwner }
	| { state: 'unreachable' }
	| { state: 'keyRejected' }
	| { state: 'missingScope'; scope: ImmichScope }
	| { state: 'tooOld'; version: string };

export interface ImmichConnection {
	status(): Promise<ImmichStatus>;
}

export interface ImmichConnectionDeps {
	gateway: ImmichGateway;
	clock: Clock;
}

/** Whether a server is new enough for Stella (§9.5). */
export function isSupportedVersion(version: ImmichVersion): boolean {
	if (version.major !== MINIMUM_VERSION.major) return version.major > MINIMUM_VERSION.major;
	if (version.minor !== MINIMUM_VERSION.minor) return version.minor > MINIMUM_VERSION.minor;
	return version.patch >= MINIMUM_VERSION.patch;
}

const shown = ({ major, minor, patch }: ImmichVersion) => `${major}.${minor}.${patch}`;

/** One round of asking: the version, then each scope the key needs, in the order they are used. */
async function probe(gateway: ImmichGateway): Promise<ImmichStatus> {
	const version = await gateway.version();
	if (!version.ok) return { state: 'unreachable' };
	if (!isSupportedVersion(version.value)) return { state: 'tooOld', version: shown(version.value) };

	const owner = await gateway.owner();
	if (!owner.ok) {
		if (owner.failure === 'unauthorized') return { state: 'keyRejected' };
		if (owner.failure === 'forbidden') return { state: 'missingScope', scope: 'user.read' };
		return { state: 'unreachable' };
	}

	const people = await gateway.listPeople(1, 1);
	if (!people.ok) {
		if (people.failure === 'forbidden') return { state: 'missingScope', scope: 'person.read' };
		return { state: people.failure === 'unauthorized' ? 'keyRejected' : 'unreachable' };
	}

	// The count needs its own scope, and Immich can only be asked about a person who exists.
	const someone = people.value.people[0];
	if (someone) {
		const statistics = await gateway.personStatistics(someone.id);
		if (!statistics.ok && statistics.failure === 'forbidden') {
			return { state: 'missingScope', scope: 'person.statistics' };
		}

		// The glimpse lists their photos and shows them: two scopes, and the second can only be
		// tried on a photo that exists — their newest, at the smallest size there is.
		const photos = await gateway.latestAssets(someone.id, 1, null);
		if (!photos.ok && photos.failure === 'forbidden') return { state: 'missingScope', scope: 'asset.read' };
		const newest = photos.ok ? photos.value.assets[0] : undefined;
		if (newest) {
			const image = await gateway.assetImage(newest.id, 'thumbnail');
			if (!image.ok && image.failure === 'forbidden') return { state: 'missingScope', scope: 'asset.view' };
		}
	}

	return { state: 'connected', version: shown(version.value), owner: owner.value };
}

export function createImmichConnection({ gateway, clock }: ImmichConnectionDeps): ImmichConnection {
	let known: { status: ImmichStatus; askedAt: number } | null = null;
	/* The round in flight; two pages opening at once share it rather than asking twice. */
	let asking: Promise<ImmichStatus> | null = null;

	function due(): boolean {
		if (!known) return true;
		const keep = known.status.state === 'connected' ? STATUS_INTERVAL_MS : FAILURE_RETRY_MS;
		return clock.now() - known.askedAt >= keep;
	}

	return {
		async status() {
			if (!asking && !due() && known) return known.status;
			if (!asking) {
				const askedAt = clock.now();
				// Cleared where it is set, so a failed round frees the next one.
				asking = probe(gateway)
					.then((status) => {
						known = { status, askedAt };
						return status;
					})
					.finally(() => (asking = null));
			}
			return asking;
		}
	};
}
