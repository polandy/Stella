import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getConfig } from '../config';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { seedRelationshipTypes } from './seed';

/*
 * Lazy, memoized database handle.
 *
 * `bun:sqlite` and Drizzle's Bun driver only exist in the Bun runtime, but the SvelteKit
 * build runs a Node-based route-analysis step that would try to *link* those modules and
 * fail. We therefore import them lazily via `require` inside `getDb`, so the static build
 * graph never references them; at runtime (always Bun) they resolve normally. Only
 * type-only imports remain static — those are erased at build time.
 */

let instance: BunSQLiteDatabase<typeof schema> | null = null;

export function getDb(): BunSQLiteDatabase<typeof schema> {
	if (instance) return instance;

	const { Database } = require('bun:sqlite') as typeof import('bun:sqlite');
	const { drizzle } = require('drizzle-orm/bun-sqlite') as typeof import('drizzle-orm/bun-sqlite');
	const { migrate } = require('drizzle-orm/bun-sqlite/migrator') as typeof import('drizzle-orm/bun-sqlite/migrator');

	const config = getConfig();
	// Ensure the data directory exists before opening the file.
	mkdirSync(dirname(config.databasePath), { recursive: true });

	const sqlite = new Database(config.databasePath, { create: true });
	// Pragmas: WAL for concurrent reads, enforced FKs, a patient busy timeout.
	sqlite.exec('PRAGMA journal_mode = WAL;');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	sqlite.exec('PRAGMA busy_timeout = 5000;');
	sqlite.exec('PRAGMA synchronous = NORMAL;');

	instance = drizzle(sqlite, { schema });

	// Apply pending migrations on startup (forward-only). The `drizzle/` folder ships with
	// the app and is resolved relative to the working directory.
	migrate(instance, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(instance);
	ensureSearchIndex(sqlite);

	return instance;
}

export { schema };
