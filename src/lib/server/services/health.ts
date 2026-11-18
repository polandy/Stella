import type { Database } from 'bun:sqlite';
import { checkDatabase } from '../db/database-health';

/*
 * The `health` context of the composition root (docs/dev/08 §8.3): what `/healthz` answers
 * (docs/dev/07 §7.5.1). The version rides along so an operator sees which image is running.
 */
export type HealthReport =
	{ ok: true; version: string; migrations: number } | { ok: false; version: string };

export interface HealthServices {
	check(): HealthReport;
}

export interface HealthWiring {
	sqlite: Database;
	/** The version this build is (`APP_VERSION`). */
	version: string;
}

export function createHealthServices({ sqlite, version }: HealthWiring): HealthServices {
	return {
		check() {
			const database = checkDatabase(sqlite);
			return database.ok
				? { ok: true, version, migrations: database.migrations }
				: { ok: false, version };
		}
	};
}
