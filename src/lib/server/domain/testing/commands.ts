import type {
	CommandDeps,
	CommandHandlers,
	CommandReceipt,
	CommandReceiptRepository
} from '../commands/dispatch';
import { fixedClock } from './clock';

/** A receipt book held in memory: claims, completes and releases as the adapter does. */
export function inMemoryReceipts(): CommandReceiptRepository {
	const receipts = new Map<string, CommandReceipt>();
	return {
		find: async (id) => receipts.get(id) ?? null,
		claim: async (receipt) => {
			const existing = receipts.get(receipt.id);
			if (existing) return existing;
			receipts.set(receipt.id, { ...receipt, status: 'pending', result: null });
			return null;
		},
		reclaim: async (id, claimedAt, at) => {
			const receipt = receipts.get(id);
			if (receipt?.status !== 'pending' || receipt.claimedAt !== claimedAt) return false;
			receipts.set(id, { ...receipt, claimedAt: at });
			return true;
		},
		complete: async (id, result) => {
			const receipt = receipts.get(id);
			if (receipt) receipts.set(id, { ...receipt, status: 'applied', result });
		},
		release: async (id) => void receipts.delete(id)
	};
}

/**
 * What `dispatchCommand` takes, with only the handlers a test names: a command of any other
 * type fails loud rather than answering something the test never said.
 */
export function commandDepsWith(
	handlers: Partial<CommandHandlers>,
	receipts: CommandReceiptRepository = inMemoryReceipts()
): CommandDeps {
	const table = new Proxy(handlers, {
		get: (given, type) => {
			if (typeof type === 'symbol' || type in given) return Reflect.get(given, type);
			return async () => {
				throw new Error(`The ${type} handler was not expected in this test`);
			};
		}
	});
	return { receipts, clock: fixedClock(0), handlers: table as CommandHandlers };
}
