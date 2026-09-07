import { describe, expect, test } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import {
	collectMentions,
	listMentionedIn,
	type MentionedIn,
	type MentionedInRepository
} from './mentioned-in';

/* The reverse side of an @-mention: who names this person (docs/02 §2.20.1). */

const viewer: Viewer = { id: 'u-1', householdId: 'h-1' };

function reference(over: Partial<MentionedIn> = {}): MentionedIn {
	return {
		kind: 'journal',
		entryId: 'j-1',
		sourceContactId: 'c-beat',
		sourceName: 'Beat Steiner',
		authorId: 'u-1',
		visibility: 'shared',
		day: '2026-07-12',
		recordedAt: 1_000,
		title: null,
		body: 'hiked with @{contact:c-sandra}',
		...over
	};
}

describe('collectMentions', () => {
	test('reads both sources as one list, newest day first', () => {
		const notes = [reference({ kind: 'note', entryId: 'n-1', day: '2026-07-20' })];
		const journal = [
			reference({ entryId: 'j-old', day: '2026-06-01' }),
			reference({ entryId: 'j-new', day: '2026-08-03' })
		];

		expect(collectMentions([notes, journal], 'c-sandra').map((m) => m.entryId)).toEqual([
			'j-new',
			'n-1',
			'j-old'
		]);
	});

	test('breaks a same-day tie by which was written down later', () => {
		const items = [
			reference({ entryId: 'j-early', recordedAt: 10 }),
			reference({ entryId: 'j-late', recordedAt: 20 })
		];

		expect(collectMentions([items], 'c-sandra').map((m) => m.entryId)).toEqual([
			'j-late',
			'j-early'
		]);
	});

	test('orders a dead heat by kind, so the list does not reshuffle between reads', () => {
		const items = [
			reference({ kind: 'note', entryId: 'n-1' }),
			reference({ kind: 'journal', entryId: 'j-1' })
		];

		expect(collectMentions([items], 'c-sandra').map((m) => m.kind)).toEqual(['journal', 'note']);
	});

	test('drops an entry that is already about this person — that is not a reference elsewhere', () => {
		const items = [
			reference({ entryId: 'j-own', sourceContactId: 'c-sandra' }),
			reference({ entryId: 'j-other' })
		];

		// The positive control: the other entry, read the same way, is kept.
		expect(collectMentions([items], 'c-sandra').map((m) => m.entryId)).toEqual(['j-other']);
	});
});

describe('listMentionedIn', () => {
	test('asks both sources about the person and hands back one merged list', async () => {
		const asked: { method: string; contactId: string }[] = [];
		const mentions: MentionedInRepository = {
			async listNoteMentionsOfVisibleTo(_v, contactId) {
				asked.push({ method: 'notes', contactId });
				return [reference({ kind: 'note', entryId: 'n-1', day: '2026-05-01' })];
			},
			async listJournalMentionsOfVisibleTo(_v, contactId) {
				asked.push({ method: 'journal', contactId });
				return [reference({ entryId: 'j-1', day: '2026-09-01' })];
			}
		};

		const found = await listMentionedIn({ mentions }, viewer, 'c-sandra');

		expect(found.map((m) => m.entryId)).toEqual(['j-1', 'n-1']);
		expect(asked).toEqual([
			{ method: 'notes', contactId: 'c-sandra' },
			{ method: 'journal', contactId: 'c-sandra' }
		]);
	});
});
