import { describe, expect, it } from 'bun:test';
import type { Command } from '../../../commands/commands';
import { TranslatableError } from '../../../errors/translatable';
import { phrase } from '../../../i18n/phrase';
import { createTranslator } from '../../../i18n/translate';
import type { CapturedMoment } from '../moments/moments';
import {
	CLAIM_STALE_AFTER_MS,
	CommandFailedError,
	dispatchCommand,
	type CommandActor,
	type CommandDeps,
	type CommandReceipt,
	type CommandReceiptRepository
} from './dispatch';

/*
 * The command dispatcher (docs/04 §4.11.2). A command is applied once,
 * however often it arrives: its id is claimed before the handler runs and the result kept, so a
 * resend answers with what happened the first time. A refusal the member can act on releases
 * the claim, so the same command can be corrected and sent again.
 */

const t = createTranslator('en');
const actor: CommandActor = { userId: 'u1', householdId: 'h1', locale: 'en' };

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
	payload: {
		body: 'Coffee with @Julia',
		entryDate: '2026-09-27',
		visibility: 'shared',
		newPeople: []
	},
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
	let linkBatches = 0;
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
			'gift.add': async () => ({ giftId: 'g' }),
			'gift.edit': async () => ({ giftId: 'g' }),
			'gift.markGiven': async () => ({ giftId: 'g' }),
			'gift.remove': async () => ({ giftId: 'g' }),
			'tag.assign': async () => ({ tagId: 't' }),
			'circle.join': async () => ({ circleId: 'c' }),
			'relationship.add': async () => ({ relationshipId: 'r' }),
			'relationship.addMany': async () => {
				linkBatches++;
				return { relationshipIds: ['r1', 'r2'] };
			},
			'contact.add': async () => ({ contactId: 'c' }),
			'journal.write': async () => ({
				entryId: 'e',
				anchorContactId: 'c',
				visibility: 'shared' as const
			}),
			'field.add': async () => ({ fieldId: 'f' }),
			'date.add': async () => ({ dateId: 'd' }),
			'gallery.add': async () => ({ contactId: 'c', visibility: 'shared' as const }),
			'gallery.photo': async () => 'photo',
			'circleGallery.add': async () => ({
				circleId: 'k',
				role: null,
				visibility: 'shared' as const
			}),
			'circleGallery.photo': async () => 'photo'
		}
	};
	return {
		deps,
		receipts,
		applied: () => applied,
		linkBatches: () => linkBatches,
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
		if (outcome.status === 'refused')
			expect(outcome.reason(t)).toContain('Mention at least one person');
		expect(f.receipts.has('cmd1')).toBe(false);
		// The refusal itself travels along, so an edge can react to its kind, not its wording.
		if (outcome.status === 'refused') expect(outcome.error).toBeInstanceOf(Refused);

		refuse = false;
		expect(await dispatchCommand(f.deps, actor, moment())).toMatchObject({
			status: 'applied',
			repeated: false
		});
		expect(f.applied()).toBe(2);
	});

	it('releases the claim and rethrows an unexpected failure, which is ours rather than the member’s', async () => {
		const diskFull = new Error('disk full');
		const f = fakes(async () => {
			throw diskFull;
		});
		const thrown = await dispatchCommand(f.deps, actor, moment()).catch((err: unknown) => err);

		// Named by the command it broke, so the log says what the member was doing.
		expect(thrown).toBeInstanceOf(CommandFailedError);
		expect(thrown).toMatchObject({ commandType: 'moment.capture', commandId: 'cmd1' });
		expect((thrown as CommandFailedError).cause).toBe(diskFull);
		expect(f.receipts.has('cmd1')).toBe(false);
	});

	it('refuses an id another member already used, without applying anything', async () => {
		const f = fakes();
		await dispatchCommand(f.deps, actor, moment());
		const other = await dispatchCommand(
			f.deps,
			{ userId: 'u2', householdId: 'h1', locale: 'en' },
			moment()
		);

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
		expect(await dispatchCommand(f.deps, actor, moment())).toMatchObject({
			status: 'applied',
			repeated: false
		});
		expect(f.applied()).toBe(1);
	});
});

describe('dispatchCommand, for several links at once', () => {
	const links = (id = 'cmd2'): Command => ({
		id,
		type: 'relationship.addMany',
		payload: {
			contactId: 'lio',
			typeChoice: 'reverse:parent_child',
			status: 'current',
			description: null,
			links: [
				{ targetId: 'anna', sinceDate: '2015-04-12' },
				{ targetId: 'bert', sinceDate: null }
			]
		},
		issuedAt: 600
	});

	it('applies the whole batch as one command, and a resend answers the same links without writing again', async () => {
		const f = fakes();
		expect(await dispatchCommand(f.deps, actor, links())).toEqual({
			status: 'applied',
			result: { relationshipIds: ['r1', 'r2'] },
			repeated: false
		});
		expect(await dispatchCommand(f.deps, actor, links())).toEqual({
			status: 'applied',
			result: { relationshipIds: ['r1', 'r2'] },
			repeated: true
		});
		expect(f.linkBatches()).toBe(1);
		expect(f.receipts.get('cmd2')).toMatchObject({
			type: 'relationship.addMany',
			status: 'applied'
		});
	});
});
