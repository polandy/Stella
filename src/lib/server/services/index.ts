import { createServices, type AppServices } from './app-services';
import { APP_VERSION } from '../../version';
import { systemClock } from '../clock';
import { getConfig } from '../config';
import { getDb, getSqlite } from '../db';
import { ulidGenerator } from '../id';

/*
 * Composition root — the single place that wires concrete adapters (Drizzle repositories,
 * system clock, ULID generator, Bun password hashing) into the domain use-cases' `deps`
 * (docs/08 §8.3). Everything is lazy so importing this module has no side effects and the
 * build's route analysis never touches the Bun-only database (see db/index.ts).
 *
 * The object graph is `AppServices`, grouped by bounded context: `createServices` builds it once
 * per process and `hooks.server.ts` hands it to every request as `locals.services` (AR-01).
 */

let services: AppServices | null = null;

/**
 * The process's one `AppServices`, built on the first request. Only `hooks.server.ts` calls
 * this; everything else reads `locals.services`.
 */
export function getServices(): AppServices {
	return (services ??= createServices({
		config: getConfig(),
		db: getDb(),
		sqlite: getSqlite(),
		clock: systemClock,
		ids: ulidGenerator,
		version: APP_VERSION
	}));
}
