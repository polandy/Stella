import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../../i18n/translate';
import type { CommandDeps, CommandReceipt } from '../domain/commands/dispatch';
import { MomentNeedsPersonError, type CapturedMoment } from '../domain/moments/moments';
import { RelationshipsRefusedError } from '../domain/relationships/add-many';
import { phrase } from '../../i18n/phrase';
import { receiveQueued } from './receive';

/*
 * `POST /api/commands` behind its route (docs/04 §4.11.2): a phone's
 * outbox sends what it held back, in order, and gets one answer per command. A command that
 * cannot be read or may not be queued is refused on its own; the rest are still applied.
 */

const t = createTranslator('en');
const actor = { userId: 'u1', householdId: 'h1', locale: 'en' as const };
const captured: CapturedMoment = {
	entryId: 'e1',
	anchorContactId: 'julia',
	mentionedContactIds: [],
	createdContactIds: [],
	linkSuggestion: null
};

const result = { ...captured, visibility: 'shared' as const };

const ids = [
	'01K6A5ZQ3V9W8X7Y6Z5A4B3C21',
	'01K6A5ZQ3V9W8X7Y6Z5A4B3C22',
	'01K6A5ZQ3V9W8X7Y6Z5A4B3C23'
];
const moment = (id: string, body = 'Coffee with @Julia') => ({
	id,
	type: 'moment.capture',
	payload: { body, entryDate: '2026-09-27', visibility: 'shared', newPeople: [] },
	issuedAt: 500
});

function fakes() {
	const receipts = new Map<string, CommandReceipt>();
	const bodies: string[] = [];
	const deps: CommandDeps = {
		clock: { now: () => 1_000 },
		receipts: {
			async find(id) {
				return receipts.get(id) ?? null;
			},
			async claim(r) {
				const existing = receipts.get(r.id);
				if (existing) return existing;
				receipts.set(r.id, { ...r, status: 'pending', result: null });
				return null;
			},
			async reclaim() {
				return false;
			},
			async complete(id, result) {
				Object.assign(receipts.get(id)!, { status: 'applied', result });
			},
			async release(id) {
				receipts.delete(id);
			}
		},
		handlers: {
			'moment.capture': async (_actor, payload) => {
				if (payload.body.includes('nobody')) throw new MomentNeedsPersonError();
				if (payload.body.includes('crash')) throw new Error('disk full');
				bodies.push(payload.body);
				return { ...captured, visibility: payload.visibility };
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
			'relationship.addMany': async (_actor, payload) => {
				if (payload.description === 'refuse otto') {
					throw new RelationshipsRefusedError([
						{
							targetId: 'otto',
							targetName: 'Otto Meier',
							reason: phrase('errors.relationship.duplicate')
						}
					]);
				}
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
	return { deps, bodies };
}

describe('receiveQueued', () => {
	it('applies each command in the order sent and answers each', async () => {
		const f = fakes();
		const answers = await receiveQueued(f.deps, actor, t, [
			moment(ids[0], 'first @Julia'),
			moment(ids[1], 'second @Julia')
		]);

		expect(answers).toEqual([
			{ id: ids[0], status: 'applied', result },
			{ id: ids[1], status: 'applied', result }
		]);
		expect(f.bodies).toEqual(['first @Julia', 'second @Julia']);
	});

	it('refuses one command in the member’s words and still applies the others', async () => {
		const f = fakes();
		const answers = await receiveQueued(f.deps, actor, t, [
			moment(ids[0], 'nobody here'),
			moment(ids[1], 'after @Julia')
		]);

		expect(answers[0]).toEqual({
			id: ids[0],
			status: 'refused',
			reason: 'Mention at least one person with @ so the moment has a place to go.'
		});
		expect(answers[1]).toMatchObject({ id: ids[1], status: 'applied' });
		expect(f.bodies).toEqual(['after @Julia']);
	});

	it('names each refused person of a batch, so the form can mark them (docs/02 §2.4)', async () => {
		const f = fakes();
		const [answer] = await receiveQueued(f.deps, actor, t, [
			{
				id: ids[0],
				type: 'relationship.addMany',
				payload: {
					contactId: 'anna',
					typeChoice: 'forward:parent_child',
					status: 'current',
					description: 'refuse otto',
					links: [
						{ targetId: 'lio', sinceDate: null },
						{ targetId: 'otto', sinceDate: null }
					]
				},
				issuedAt: 500
			}
		]);

		expect(answer).toEqual({
			id: ids[0],
			status: 'refused',
			reason: 'Otto Meier: That relationship already exists.',
			refusals: [{ targetId: 'otto', reason: 'That relationship already exists.' }]
		});
	});

	it('refuses what it cannot read, naming it by its id when there is one', async () => {
		const f = fakes();
		const answers = await receiveQueued(f.deps, actor, t, [
			{ ...moment(ids[0]), type: 'contact.delete' },
			'garbage',
			moment(ids[1])
		]);

		expect(answers[0]).toMatchObject({ id: ids[0], status: 'refused' });
		expect(answers[1]).toMatchObject({ id: '', status: 'refused' });
		expect(answers[2]).toMatchObject({ id: ids[1], status: 'applied' });
	});

	it('answers failed for our own error, so the phone keeps the command and tries later', async () => {
		const f = fakes();
		const answers = await receiveQueued(f.deps, actor, t, [
			moment(ids[0], 'crash @Julia'),
			moment(ids[1])
		]);

		expect(answers).toEqual([
			{ id: ids[0], status: 'failed' },
			{ id: ids[1], status: 'applied', result }
		]);
	});
});
