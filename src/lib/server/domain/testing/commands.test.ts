import { describe, expect, it } from 'bun:test';
import type { Command } from '../../../commands/commands';
import { dispatchCommand } from '../commands/dispatch';
import { commandDepsWith, inMemoryReceipts } from '.';

const actor = { userId: 'u1', householdId: 'h1', locale: 'en' as const };
const claim = { id: 'c1', memberId: 'u1', householdId: 'h1', type: 'tag.assign' as const };

describe('inMemoryReceipts', () => {
	it('claims an id once, then answers with the receipt already there', async () => {
		const receipts = inMemoryReceipts();
		expect(await receipts.claim({ ...claim, claimedAt: 1 })).toBeNull();
		expect(await receipts.claim({ ...claim, claimedAt: 2 })).toMatchObject({
			status: 'pending',
			claimedAt: 1
		});
	});

	it('keeps the result once complete, and forgets a released claim', async () => {
		const receipts = inMemoryReceipts();
		await receipts.claim({ ...claim, claimedAt: 1 });
		await receipts.complete('c1', { tagId: 't1' }, 2);
		expect(await receipts.find('c1')).toMatchObject({ status: 'applied', result: { tagId: 't1' } });
		await receipts.release('c1');
		expect(await receipts.find('c1')).toBeNull();
	});

	it('takes over a pending claim only while it is the one claimed at that time', async () => {
		const receipts = inMemoryReceipts();
		await receipts.claim({ ...claim, claimedAt: 1 });
		expect(await receipts.reclaim('c1', 0, 5)).toBe(false);
		expect(await receipts.reclaim('c1', 1, 5)).toBe(true);
		expect(await receipts.find('c1')).toMatchObject({ claimedAt: 5 });
	});
});

describe('commandDepsWith', () => {
	const command: Command = {
		id: 'c1',
		type: 'tag.assign',
		payload: { contactId: 'anna', name: 'Choir', color: null },
		issuedAt: 0
	};

	it('applies a command through the handler the test named', async () => {
		const deps = commandDepsWith({ 'tag.assign': async () => ({ tagId: 't1' }) });
		expect(await dispatchCommand(deps, actor, command)).toEqual({
			status: 'applied',
			result: { tagId: 't1' },
			repeated: false
		});
	});

	it('fails loud on a command whose handler the test did not name', async () => {
		const deps = commandDepsWith({});
		await expect(dispatchCommand(deps, actor, command)).rejects.toMatchObject({
			cause: new Error('The tag.assign handler was not expected in this test')
		});
	});
});
