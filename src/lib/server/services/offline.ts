import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createCommandHandlers, type HandlerContexts } from '../commands/handlers';
import { createDrizzleCommandReceiptRepository } from '../db/command-receipt-repository';
import { createDrizzleEntryOwnership } from '../db/entry-ownership';
import type * as schema from '../db/schema';
import type { CommandDeps, CommandReceiptRepository } from '../domain/commands/dispatch';
import type { EntryOwnership } from '../domain/commands/photos';

/*
 * The `offline` bounded context of the composition root (docs/08 §8.3): the command dispatcher
 * every change goes through, from a form or a phone's outbox (docs/04 §4.11.2). Its own
 * repositories are the receipt book and the entry-ownership read a photo needs; its handler
 * table (`commands/handlers.ts`) calls into the other contexts, which `createServices` hands it.
 */
export interface OfflineServices {
	receipts: CommandReceiptRepository;
	entries: EntryOwnership;
	/** What `dispatchCommand` and `receiveQueued` take. */
	commandDeps: CommandDeps;
}

export interface OfflineWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	contexts: HandlerContexts;
}

export function createOfflineServices({ db, clock, contexts }: OfflineWiring): OfflineServices {
	const receipts = createDrizzleCommandReceiptRepository(db);
	const entries = createDrizzleEntryOwnership(db);
	return {
		receipts,
		entries,
		commandDeps: {
			receipts,
			clock,
			handlers: createCommandHandlers(contexts, { receipts, entries })
		}
	};
}
