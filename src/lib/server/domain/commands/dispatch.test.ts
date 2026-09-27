import { describe, expect, it } from 'bun:test';
import type { Command } from '../../../commands/commands';
import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { createTranslator } from '../../../i18n/translate';
import type { CapturedMoment } from '../moments/moments';
import {
	CLAIM_STALE_AFTER_MS,
	dispatchCommand,
	type CommandActor,
	type CommandDeps,
	type CommandReceipt,
	type CommandReceiptRepository
} from './dispatch';

/*
 * The command dispatcher (docs/concepts/offline-capture.md §3). A command is applied once,
 * however often it arrives: its id is claimed before the handler runs and the result kept, so a
 * resend answers with what happened the first time. A refusal the member can act on releases
 * the claim, so the same command can be corrected and sent again.
 */

const t = createTranslator('en');
const actor: CommandActor = { userId: 'u1', householdId: 'h1' };

const captured: CapturedMoment = {
	entryId: 'e1',
	anchorContactId: 'julia',
	mentionedContactIds: [],
	createdContactIds: [],
	linkSuggestion: null
};

/** What the capture handler answers: the moment, plus the visibility a later photo needs. */
const result = { ...captured, visibility: 'shared' as const };

const moment = (id = 'cmd1'): Command => ({
	id,
	type: 'moment.capture',
	payload: { body: 'Coffee with @Julia', entryDate: '2026-09-27', visibility: 'shared', newPeople: [] },
	issuedAt: 500
});

class Refused extends TranslatableError {
	constructor() {
		super(phrase('errors.moment.needsPerson'), 'Refused');
	}
}

function fakes(handler: () => Promise<CapturedMoment> = async () => captured) {
	const receipts = new Map<string, CommandReceipt>();
	let now = 1_000;
	let applied = 0;
	const repo: CommandReceiptRepository = {
		async find(id) {
			return receipts.get(id) ?? null;
		},
		async claim(r) {
			const existing = receipts.get(r.id);
			if (existing) return existing;
			receipts.set(r.id, { ...r, status: 'pending', result: null });
			return null;
		},
		async reclaim(id, claimedAt, at) {
			const r = receipts.get(id);
			if (!r || r.status !== 'pending' || r.claimedAt !== claimedAt) return false;
			r.claimedAt = at;
			return true;
		},
		async complete(id, result) {
			const r = receipts.get(id)!;
			r.status = 'applied';
			r.result = result;
		},
		async release(id) {
			receipts.delete(id);
		}
	};
	const deps: CommandDeps = {
		receipts: repo,
		clock: { now: () => now },
		handlers: {
			'moment.capture': async () => {
				applied++;
				return { ...(await handler()), visibility: 'shared' as const };
			},
			'moment.photo': async () => 'photo',
			'note.add': async () => ({ noteId: 'n' }),
			'interaction.log': async () => ({ interactionId: 'i' }),
			'tag.assign': async () => ({ tagId: 't' }),
			'circle.join': async () => ({ circleId: 'c' }),
			'relationship.add': async () => ({ relationshipId: 'r' }),
			'contact.add': async () => ({ contactId: 'c' })
		}
	};
	return {
		deps,
		receipts,
		applied: () => applied,
		advance: (ms: number) => (now += ms)
	};
}

describe('dispatchCommand', () => {
	it('applies a new command and keeps its result under its id', async () => {
		const f = fakes();
		const outcome = await dispatchCommand(f.deps, actor, moment());

		expect(outcome).toEqual({ status: 'applied', result, repeated: false });
		expect(f.applied()).toBe(1);
		expect(f.receipts.get('cmd1')).toMatchObject({
			memberId: 'u1',
			householdId: 'h1',
			type: 'moment.capture',
			status: 'applied',
			result
		});
	});

	it('answers a resend with the first result and applies nothing again', async () => {
		const f = fakes();
		await dispatchCommand(f.deps, actor, moment());
		const again = await dispatchCommand(f.deps, actor, moment());

		expect(again).toEqual({ status: 'applied', result, repeated: true });
		expect(f.applied()).toBe(1);
	});

	it('refuses with the reason and releases the claim, so a corrected command can be resent', async () => {
		let refuse = true;
		const f = fakes(async () => {
			if (refuse) throw new Refused();
			return captured;
		});

		const outcome = await dispatchCommand(f.deps, actor, moment());
		expect(outcome.status).toBe('refused');
		if (outcome.status === 'refused') expect(outcome.reason(t)).toContain('Mention at least one person');
		expect(f.receipts.has('cmd1')).toBe(false);

		refuse = false;
		expect(await dispatchCommand(f.deps, actor, moment())).toMatchObject({ status: 'applied', repeated: false });
		expect(f.applied()).toBe(2);
	});

	it('releases the claim and rethrows an unexpected failure, which is ours rather than the member’s', async () => {
		const f = fakes(async () => {
			throw new Error('disk full');
		});
		await expect(dispatchCommand(f.deps, actor, moment())).rejects.toThrow('disk full');
		expect(f.receipts.has('cmd1')).toBe(false);
	});

	it('refuses an id another member already used, without applying anything', async () => {
		const f = fakes();
		await dispatchCommand(f.deps, actor, moment());
		const other = await dispatchCommand(f.deps, { userId: 'u2', householdId: 'h1' }, moment());

		expect(other.status).toBe('refused');
		if (other.status === 'refused') expect(other.reason(t)).toContain('already');
		expect(f.applied()).toBe(1);
	});

	it('says busy while the same command is still being applied, rather than claiming it is done', async () => {
		let finish!: (m: CapturedMoment) => void;
		let entered!: () => void;
		const inside = new Promise<void>((resolve) => (entered = resolve));
		const f = fakes(() => {
			entered();
			return new Promise((resolve) => (finish = resolve));
		});

		const first = dispatchCommand(f.deps, actor, moment());
		// Positive signal: the first run has claimed the id and is inside its handler.
		await inside;
		expect(f.receipts.get('cmd1')?.status).toBe('pending');
		expect(await dispatchCommand(f.deps, actor, moment())).toEqual({ status: 'busy' });

		finish(captured);
		expect(await first).toMatchObject({ status: 'applied', repeated: false });
		expect(f.applied()).toBe(1);
	});

	it('takes over a claim left pending too long, preferring a possible duplicate to a lost moment', async () => {
		const f = fakes();
		// A claim whose run never finished — the process stopped between claiming and completing.
		f.receipts.set('cmd1', {
			id: 'cmd1',
			memberId: 'u1',
			householdId: 'h1',
			type: 'moment.capture',
			status: 'pending',
			result: null,
			claimedAt: 1_000
		});

		expect(await dispatchCommand(f.deps, actor, moment())).toEqual({ status: 'busy' });
		f.advance(CLAIM_STALE_AFTER_MS + 1);
		expect(await dispatchCommand(f.deps, actor, moment())).toMatchObject({ status: 'applied', repeated: false });
		expect(f.applied()).toBe(1);
	});
});
